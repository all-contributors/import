import { Octokit } from "@octokit/core";
import { retry } from "@octokit/plugin-retry";
import { throttling } from "@octokit/plugin-throttling";
import { paginateRest } from "@octokit/plugin-paginate-rest";
import { paginateGraphql } from "@octokit/plugin-paginate-graphql";

import pino from "pino";

const octokitLogger = pino().child({ name: "octokit" });

export default Octokit.plugin(
  retry,
  throttling,
  paginateRest,
  paginateGraphql
).defaults({
  userAgent: "gr2m/all-contributors-import",
  log: {
    debug: octokitLogger.debug.bind(octokitLogger),
    info: octokitLogger.info.bind(octokitLogger),
    warn: octokitLogger.warn.bind(octokitLogger),
    error: octokitLogger.error.bind(octokitLogger),
  },
  throttle: {
    onRateLimit: (retryAfter, { method, url }, octokit, retryCount) => {
      octokit.log.warn({ method, url }, `Request quota exhausted for request`);

      if (retryCount < 5) {
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

      if (retryCount < 5) {
        octokit.log.info(`Retrying after ${retryAfter} seconds!`);
        return true;
      }
    },
  },
});
