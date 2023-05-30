import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

/**
 * @param {{log: import("pino").Logger, owner: string, repo: string, path: string, name: string, data: any}} options
 */
export function writeDebugFile({ log, owner, repo, path, name, data }) {
  const filePath = `.results/${owner}/${repo}/${path}/${name}.json`;
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n");

  log.debug(`${path} written`);
}
