// @ts-check

import { writeFileSync, mkdirSync, rmSync, appendFileSync } from "node:fs";

import pino from "pino";

import { findRepositoryFileEndorsements } from "./lib/find-repository-file-endorsements.js";

/**
 * @type {import(".").DatabaseColumnKeys}
 */
const COLUMNS = [
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

  writeFileSync(".results/endorsements.csv", COLUMNS.join(",") + "\n");

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

    for (const searchResult of response.data) {
      const newEndorsements = await findRepositoryFileEndorsements(
        octokit,
        mainLogger,
        state,
        searchResult
      );

      if (!newEndorsements) continue;

      let seq = 0;

      appendFileSync(
        ".results/endorsements.csv",
        newEndorsements
          .map((endorsement) => [
            ++seq,
            ...COLUMNS.map((column) => endorsement[column]).join(","),
          ])
          .join("\n") + "\n"
      );
    }
  }

  mainLogger.info("done");
}
