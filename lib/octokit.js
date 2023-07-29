import { Octokit, App } from "octokit";
import { paginateGraphql } from "@octokit/plugin-paginate-graphql";

import pino from "pino";

const octokitLogger = pino().child({ name: "octokit" });

export const MAX_RETRY_COUNT = 5;

const ImportOctokit = Octokit.plugin(paginateGraphql).defaults({
  userAgent: "all-contributors/import",
  log: {
    debug: octokitLogger.debug.bind(octokitLogger),
    info: octokitLogger.info.bind(octokitLogger),
    warn: octokitLogger.warn.bind(octokitLogger),
    error: octokitLogger.error.bind(octokitLogger),
  },
  throttle: {
    onRateLimit: (retryAfter, { method, url }, octokit, retryCount) => {
      octokit.log.warn({ method, url }, `Request quota exhausted for request`);

      if (retryCount < MAX_RETRY_COUNT) {
        octokit.log.info(`Retrying after ${retryAfter} seconds!`);
        return true;
      }
    },
    onSecondaryRateLimit: (
      retryAfter,
      { method, url },
      octokit,
      retryCount
    ) => {
      // does not retry, only logs a warning
      octokit.log.warn({ method, url }, `SecondaryRateLimit detected`);

      if (retryCount < MAX_RETRY_COUNT) {
        octokit.log.info(`Retrying after ${retryAfter} seconds!`);
        return true;
      }
    },
  },
});

export default App.defaults({
  log: {
    debug: octokitLogger.debug.bind(octokitLogger),
    info: octokitLogger.info.bind(octokitLogger),
    warn: octokitLogger.warn.bind(octokitLogger),
    error: octokitLogger.error.bind(octokitLogger),
  },
  Octokit: ImportOctokit,
});
