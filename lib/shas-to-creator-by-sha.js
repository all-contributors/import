// @ts-check

import { slicyBy } from "./array-slice-by.js";
import Octokit from "./octokit.js";

/**
 * @param { InstanceType<typeof Octokit> } octokit
 * @param { string } owner
 * @param { string } repo
 * @param { string[] } shas
 * @returns { Promise<Record<string, import("..").User & { pullRequestUrl?: string, pullRequestMergedAt: string }>> }
 */
export async function shasToCreatorByCommitSha(octokit, owner, repo, shas) {
  /** @type Record<string, import("..").User & { pullRequestUrl?: string, pullRequestMergedAt: string }> */
  const creatorByCommitSha = {};
  const shasSliced = slicyBy(shas, 50);

  for (const shas of shasSliced) {
    const query = `
      query {
        repository(owner:"${owner}", name:"${repo}") {
          ${shas
            .map(
              (sha, index) => `
                commit${index}:object(oid:"${sha}") {
                  ... on Commit {
                    oid
                    author {
                      user {
                        databaseId
                        login
                      }
                    }
                    committer {
                      user {
                        databaseId
                        login
                      }
                    }
                    associatedPullRequests(first:1) {
                      nodes {
                        url
                        mergedAt
                        mergedBy {
                          ... on User {
                            databaseId
                            login 
                          }
                        }
                      }
                    }
                  }
                }
              `
            )
            .join("\n        ")}
        }
      }
    `;
    const { repository: results } = await octokit.graphql(query);

    for (const value of Object.values(results)) {
      if (value === null) {
        console.log(query);
        console.log(results);
        process.exit();
        continue;
      }
      const { oid, author, committer, associatedPullRequests } = value;
      const mergedBy = associatedPullRequests.nodes[0]?.mergedBy;
      const creator = mergedBy || committer.user || author.user;

      // There are cases when neither author nor committer has an assigned GitHub user account.
      // I assume when the author/committer used an unknown email address to commit
      // Example: https://github.com/thibmaek/awesome-raspberry-pi/commit/fd25d6f10b60297c3ff2c6ec394903773fef30ed.patch
      if (!creator) {
        continue;
      }

      creatorByCommitSha[oid] = {
        login: creator.login,
        id: creator.databaseId,
        pullRequestUrl: associatedPullRequests.nodes[0]?.url,
        pullRequestMergedAt: associatedPullRequests.nodes[0]?.mergedAt,
      };
    }
  }

  return creatorByCommitSha;
}
