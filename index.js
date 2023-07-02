// @ts-check

import { writeFileSync, mkdirSync, rmSync, appendFileSync } from "node:fs";

import pino from "pino";

import { findRepositoryFileEndorsements } from "./lib/find-repository-file-endorsements.js";

const SOURCE_FILES_COLUMNS = [
  "owner_id",
  "owner_login",
  "repo_id",
  "repo_name",
  "path",
  "last_commit_sha",
];
const SOURCE_FILES_PATH = "data/source-files.csv";

/**
 * @type {import(".").DatabaseColumnKeys}
 */
const ENDORSEMENTS_COLUMNS = [
  "seq",
  "owner_id",
  "owner_login",
  "repo_id",
  "repo_name",
  "creator_user_id",
  "creator_user_login",
  "recipient_user_id",
  "recipient_user_login",
  "type",
  "created_at",
  "source_context_url",
];

const ENDORSEMENTS_PATH = "data/endorsements.csv";

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

  rmSync(".results", { recursive: true, force: true });
  mkdirSync(".results", { recursive: true });

  writeFileSync(SOURCE_FILES_PATH, SOURCE_FILES_COLUMNS.join(",") + "\n");
  writeFileSync(ENDORSEMENTS_PATH, ENDORSEMENTS_COLUMNS.join(",") + "\n");

  /** @type {import("./index.js").State} */
  const state = { userIdByLogin: {}, numEndorsements: 0 };

  // search for ".all-contributorsrc" files
  // https://docs.github.com/rest/search#search-code
  const searchIterator = octokit.paginate.iterator("GET /search/code", {
    q: "filename:all-contributorsrc",
    per_page: 100,
  });

  let numTotalSearchResults;
  let numSearchResults = 0;
  let seq = 0;
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
      const result = await findRepositoryFileEndorsements(
        octokit,
        mainLogger,
        state,
        searchResult
      );

      if (!result) continue;

      const { endorsements, lastCommitSha } = result;

      appendFileSync(
        SOURCE_FILES_PATH,
        [
          searchResult.repository.owner.id,
          searchResult.repository.owner.login,
          searchResult.repository.id,
          searchResult.repository.name,
          searchResult.path,
          lastCommitSha,
        ].join(",") + "\n"
      );

      appendFileSync(
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
    }
  }

  mainLogger.info("done");
}
