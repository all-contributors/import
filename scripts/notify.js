import { inspect } from "util";

import core from "@actions/core";
import { App } from "octokit";

main();

async function main() {
  try {
    const app = new App({
      appId: +process.env.GITHUB_APP_ID,
      privateKey: process.env.GITHUB_APP_PRIVATE_KEY,
    });
    const eventType = `all-contributors-import:update`;
    const eventPayload = {
      startSeq: process.env.START_SEQ,
      endSeq: process.env.END_SEQ,
    };

    core.info(`ℹ️  Repository dispatch event type: "${eventType}"`);
    core.debug(
      `ℹ️  event client payload: ${inspect(eventPayload, { depth: Infinity })}`
    );

    const { data: appInfo } = await app.octokit.request("GET /app");
    core.info(`ℹ️  Authenticated as ${appInfo.slug} (${appInfo.html_url})`);

    await app.eachRepository(async ({ octokit, repository }) => {
      const owner = repository.owner.login;
      const repoUrl = repository.private
        ? `${owner}/[private]`
        : repository.html_url;

      core.debug(`ℹ️  Dispatching event for ${repoUrl} (id: ${repository.id})`);
      try {
        await octokit.request("POST /repos/{owner}/{repo}/dispatches", {
          owner,
          repo: repository.name,
          event_type: eventType,
          client_payload: eventPayload,
        });

        core.info(
          `✅  Event dispatched successfully for ${repoUrl} (id: ${repository.id})`
        );
      } catch (error) {
        core.warning(
          `⚠️  Dispatch error: ${inspect(error, { depth: Infinity })}`
        );
      }
    });
  } catch (error) {
    core.debug(inspect(error, { depth: Infinity }));
    core.setFailed(error.message);
  }
}
