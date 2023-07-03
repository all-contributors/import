// @ts-check

import { writeFile, mkdir, rm, appendFile, readFile } from "node:fs/promises";

import pino from "pino";

import { findRepositoryFileEndorsements } from "./lib/find-repository-file-endorsements.js";
import {
  SOURCE_FILES_COLUMNS,
  SOURCE_FILES_PATH,
  ENDORSEMENTS_COLUMNS,
  ENDORSEMENTS_PATH,
} from "./lib/constants.js";
import { endorsementToUniqueKey } from "./lib/endorsement-to-unique-key.js";
import { sourceFilesToUniqueKey } from "./lib/source-file-to-unique-key.js";

/**
 * @param {InstanceType<typeof import('./lib/octokit.js').default>} octokit
 */
export default async function run(octokit, logger = pino()) {
  const mainLogger = logger.child({ name: "main" });

  const { data: user } = await octokit.request("GET /user");
  const {
    data: {
      resources: { core, search },
    },
  } = await octokit.request("GET /rate_limit");
  mainLogger.info(
    {
      login: user.login,
      searchRateRemaining: search.remaining,
      rateLimitRemaining: core.remaining,
    },
    `Authenticated`
  );

  // we use the `.results` directory to store internal data for debugging
  await rm(".results", { recursive: true, force: true });
  await mkdir(".results", { recursive: true });

  let knownSourceFilesData = await readFile(SOURCE_FILES_PATH, "utf8").catch(
    () => ""
  );
  const currentEndorsementsData = await readFile(
    ENDORSEMENTS_PATH,
    "utf8"
  ).catch(() => "");

  if (!knownSourceFilesData) {
    await writeFile(SOURCE_FILES_PATH, SOURCE_FILES_COLUMNS.join(",") + "\n");
  }
  if (!currentEndorsementsData) {
    await writeFile(ENDORSEMENTS_PATH, ENDORSEMENTS_COLUMNS.join(",") + "\n");
  }

  /**
   * @type {Record<string, Required<import(".").SourceFile>>}
   */
  const knownSourceFiles = knownSourceFilesData
    .trim()
    .split("\n")
    .slice(1)
    .reduce((sourceFiles, line) => {
      const lineObject = SOURCE_FILES_COLUMNS.reduce((result, column, i) => {
        result[column] = line.split(",")[i];
        return result;
      }, {});

      const sourceFile = {
        owner: lineObject["owner_login"],
        ownerId: lineObject["owner_id"],
        repo: lineObject["repo_name"],
        repoId: lineObject["repo_id"],
        path: lineObject["path"],
        lastCommitSha: lineObject["last_commit_sha"],
        lastUpdatedAt: lineObject["last_updated_at"],
      };

      const key = sourceFilesToUniqueKey(sourceFile);

      return {
        ...sourceFiles,
        [key]: sourceFile,
      };
    }, {});

  const knownEndorsements = new Set();
  const userIdByLogin = {};

  const endorsementLines = currentEndorsementsData.trim().split("\n").slice(1);

  for (const line of endorsementLines) {
    const lineObject = ENDORSEMENTS_COLUMNS.reduce((result, column, i) => {
      result[column] = line.split(",")[i];
      return result;
    }, {});

    userIdByLogin[lineObject["login"]] = lineObject["user_id"];

    // @ts-expect-error
    knownEndorsements.add(endorsementToUniqueKey(lineObject));
  }

  /** @type {import("./index.js").State} */
  const state = {
    userIdByLogin: {},
    numEndorsements: endorsementLines.length,
    knownSourceFiles,
    knownEndorsements,
  };

  let seq = endorsementLines.length;

  const numKnownSourceFiles = Object.keys(knownSourceFiles).length;
  if (numKnownSourceFiles > 0) {
    mainLogger.info(
      `Checking for updates in ${numKnownSourceFiles} known source files`
    );
  } else {
    mainLogger.info(`No known source files found in ${SOURCE_FILES_PATH}`);
  }

  // iterate through all known source files and load only new changes
  // iterate through every found .all-contributorsrc file
  for (const sourceFile of Object.values(knownSourceFiles)) {
    const sourceFileLogger = mainLogger.child({
      owner: sourceFile.owner,
      repo: sourceFile.owner,
      path: sourceFile.path,
      lastCommitSha: sourceFile.lastCommitSha,
    });

    const result = await findRepositoryFileEndorsements(
      octokit,
      mainLogger,
      state,
      sourceFile
    );

    if (!result) {
      continue;
    }

    const { endorsements, lastCommitSha, lastUpdatedAt, lastFileSha } = result;

    const uniqueMatchString = `${sourceFile.repoId},${sourceFile.repo},${sourceFile.path},${sourceFile.lastCommitSha}`;
    // update source files file with new last commit sha
    knownSourceFilesData = knownSourceFilesData.replace(
      new RegExp(`${uniqueMatchString}.*$`),
      `${uniqueMatchString},${lastUpdatedAt},${lastFileSha}`
    );
    await writeFile(SOURCE_FILES_PATH, knownSourceFilesData);

    if (lastCommitSha === sourceFile.lastCommitSha) {
      sourceFileLogger.info(`No changes found`);

      continue;
    }

    // add endorsement
    await appendFile(
      ENDORSEMENTS_PATH,
      endorsements
        .map((endorsement) =>
          [
            ++seq,
            ...ENDORSEMENTS_COLUMNS.slice(1).map(
              (column) => endorsement[column]
            ),
          ].join(",")
        )
        .join("\n") + "\n"
    );

    sourceFileLogger.info(`${endorsements.length} endorsements found`);
  }

  // search for ".all-contributorsrc" files
  // https://docs.github.com/rest/search#search-code
  const searchIterator = octokit.paginate.iterator("GET /search/code", {
    q: "filename:all-contributorsrc",
    per_page: 100,
  });

  let numTotalSearchResults;
  let numSearchResults = 0;
  for await (const response of searchIterator) {
    if (!numTotalSearchResults) {
      numTotalSearchResults = response.data.total_count;
      mainLogger.info(
        { numTotalSearchResults },
        `search results for .all-contributorsrc files`
      );
    }

    numSearchResults += 1;
    const {
      data: {
        resources: { search, core },
      },
    } = await octokit.request("GET /rate_limit");
    mainLogger.info(
      {
        resultNumber: numSearchResults,
        searchRateRemaining: search.remaining,
        rateLimitRemaining: core.remaining,
      },
      "Handling search result"
    );

    // iterate through every found .all-contributorsrc file
    for (const searchResult of response.data) {
      const sourceFileLogger = mainLogger.child({
        owner: searchResult.repository.owner.login,
        repo: searchResult.repository.name,
        path: searchResult.path,
      });
      /** @type {import(".").SourceFile} */
      const sourceFile = {
        owner: searchResult.repository.owner.login,
        ownerId: searchResult.repository.owner.id,
        repo: searchResult.repository.name,
        repoId: searchResult.repository.id,
        path: searchResult.path,
      };

      const key = sourceFilesToUniqueKey(sourceFile);

      if (state.knownSourceFiles[key]) {
        sourceFileLogger.info(`Skipping known source file`);
        continue;
      }

      const result = await findRepositoryFileEndorsements(
        octokit,
        mainLogger,
        state,
        sourceFile
      );

      if (!result) continue;

      const { endorsements, lastCommitSha, lastUpdatedAt, lastFileSha } =
        result;

      await appendFile(
        SOURCE_FILES_PATH,
        [
          searchResult.repository.owner.id,
          searchResult.repository.owner.login,
          searchResult.repository.id,
          searchResult.repository.name,
          searchResult.path,
          lastCommitSha,
          lastUpdatedAt,
          lastFileSha,
        ].join(",") + "\n"
      );

      // TODO: before adding new endorsements, check if they already exist

      await appendFile(
        ENDORSEMENTS_PATH,
        endorsements
          .map((endorsement) => {
            const key = endorsementToUniqueKey(endorsement);

            if (state.knownEndorsements.has(key)) {
              sourceFileLogger.info(`Skipping known endorsement`, { key });
              return;
            }

            return [
              ++seq,
              ...ENDORSEMENTS_COLUMNS.slice(1).map(
                (column) => endorsement[column]
              ),
            ].join(",");
          })
          .filter(Boolean)
          .join("\n") + "\n"
      );

      sourceFileLogger.info(`${endorsements.length} endorsements found`);
    }
  }

  mainLogger.info("done");
}
