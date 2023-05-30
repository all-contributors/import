// @ts-check

import Octokit from "./octokit.js";

const fragment = `history(path: $path, first: 100, after: $cursor) {
              pageInfo {
                hasNextPage
                endCursor
              }
              nodes {
                oid
                committedDate
                url
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
                associatedPullRequests(first: 1) {
                  nodes {
                    url
                    baseRef {
                      name
                    }
                    mergedAt
                    mergedBy {
                      ... on User {
                        login
                        databaseId
                      }
                    }
                    mergeCommit {
                      url
                      oid
                    }
                  }
                }
              }
            }
`;
const queryDefaultBranch = `
  query paginate($cursor: String, $owner: String!, $repo: String!, $path: String!) {
    repository(owner: $owner, name: $repo) {
      defaultBranchRef {
        name
        target {
          ... on Commit {
            ${fragment}
          }
        }
      }
    }
  }
`;
const queryFromCommit = `
  query paginate($cursor: String, $owner: String!, $repo: String!, $path: String!, $sha: GitObjectID!) {
    repository(owner: $owner, name: $repo) {
      defaultBranchRef {
        name
      }
      object(oid: $sha) {
        ... on Commit {
          ${fragment}
        }
      }
    }
  }
`;

/**
 * @param {InstanceType<Octokit>} octokit
 * @param {string} owner
 * @param {string} repo
 * @param {string} path
 * @param {string} [sha]
 * @returns {Promise<(import("..").Commit & { path: string })[]>}
 */
export async function getAllCommitsForFile(octokit, owner, repo, path, sha) {
  // get all commits using GraphQL. Unfortunately getting just the commits
  // for a file gets commits that only live in a pull request, and the versions
  // in these commits confuse the script, resulting in a lot of phantom endorsements.
  // With GraphQL, we can retrieve an associated pull request and its merge commit.
  // Using merge commits instead (if present) solves the problem.
  const [query, parameters] = sha
    ? [queryFromCommit, { owner, repo, path, sha }]
    : [queryDefaultBranch, { owner, repo, path }];
  const result = await octokit.graphql.paginate(query, parameters);

  const defaultBranchName = result.repository.defaultBranchRef.name;
  const nodes = result.repository.object
    ? result.repository.object.history.nodes
    : result.repository.defaultBranchRef.target.history.nodes;

  const commits = nodes.map((commit) => {
    const [pullRequest] = commit.associatedPullRequests.nodes.filter(
      (pullRequest) => pullRequest.baseRef?.name === defaultBranchName
    );
    const { createdAt, sha, url, pullRequestUrl } = pullRequest
      ? {
          createdAt: pullRequest.mergedAt,
          sha: pullRequest.mergeCommit.oid,
          url: pullRequest.mergeCommit.url,
          pullRequestUrl: pullRequest.url,
        }
      : {
          createdAt: commit.committedDate,
          sha: commit.oid,
          url: commit.url,
          pullRequestUrl: undefined,
        };

    // yes all those ? are needed, don't get tempted.
    const creatorId = pullRequest
      ? pullRequest.mergedBy?.databaseId
      : (commit.committer?.user || commit.author?.user)?.databaseId;

    return {
      createdAt,
      sha,
      url,
      pullRequestUrl,
      creatorId,
      path,
    };
  });

  // We retrieve the last commit to check if the file was renamed.
  // https://docs.github.com/rest/commits/commits#get-a-commit
  const { data: lastCommit } = await octokit.request(
    "GET /repos/{owner}/{repo}/commits/{ref}",
    {
      owner,
      repo,
      ref: commits.at(-1).sha,
    }
  );

  // @ts-expect-error - we know that files exists
  const allContributorsFile = lastCommit.files.find(
    (file) => file.filename === path
  );

  // I have seen it happen that the last commit did not edit
  // the all-contributorsrc file. No idea why, but it happens.
  if (allContributorsFile?.status === "renamed") {
    /** @type {string} */
    // @ts-expect-error
    const newPath = allContributorsFile.previous_filename;

    return [
      ...commits,
      ...(await getAllCommitsForFile(
        octokit,
        owner,
        repo,
        newPath,
        lastCommit.parents[0].sha
      )),
    ];
  }

  return commits;
}
