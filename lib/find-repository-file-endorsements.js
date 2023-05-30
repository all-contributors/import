// @ts-check

import { getDiff } from "json-difference";

import { shasToCreatorByCommitSha } from "./shas-to-creator-by-sha.js";
import { loginsToLoginById } from "./logins-to-login-by-id.js";
import { writeDebugFile } from "./write-debug-files.js";
import Octokit from "./octokit.js";
import { getAllCommitsForFile } from "./get-all-commits-for-file.js";

/**
 *
 * @param {InstanceType<Octokit>} octokit
 * @param {import("pino").Logger} log
 * @param {import("..").State} state
 * @param {import("@octokit/openapi-types").components["schemas"]["code-search-result-item"]} searchResult
 * @returns {Promise<import("..").DatabaseColumns[] | undefined>}
 */
export async function findRepositoryFileEndorsements(
  octokit,
  log,
  state,
  searchResult
) {
  const owner = searchResult.repository.owner.login.toLowerCase();
  const repo = searchResult.repository.name.toLowerCase();
  const repoId = searchResult.repository.id;
  const path = searchResult.path;

  /**
   * @type {import("..").DatabaseColumns[]}
   */
  const newEndorsements = [];

  const repoLogger = log.child({
    owner,
    repo,
    repoId,
    path,
  });

  const isValidFile = /\.all-contributorsrc(.json)?$/.test(path);
  if (!isValidFile) {
    repoLogger.info(`Invalid file path`);
    return;
  }

  repoLogger.info({ owner, repo, path }, `Loading commits`);

  /**
   * get only the relevant commits with endorsements
   *
   * @type { import("..").CommitWithContributors[] }
   */
  const commitsWithContributors = [];

  /**
   * get only the relevant commits with endorsements
   *
   * @type { import("..").CommitWithEndorsements[] }
   */
  const commitsWithEndorsements = [];

  /**
   * Keep state of contributors between commits to calculate new endorsements
   *
   *  @type { import("..").Contributors }
   */
  let previousContributors = {};
  let previousCommitSha;

  // counters
  let numValidCommits = 0;
  let numCommitsWithEndorsements = 0;

  const commits = await getAllCommitsForFile(octokit, owner, repo, path);

  for (const commit of commits.reverse()) {
    commit.path = ".all-contributorsrc";
    const rawGitHubUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${commit.sha}/${commit.path}`;

    const commitLogger = repoLogger.child({
      sha: commit.sha,
    });

    // commitLogger.info({ url: commit.url }, `Loading file content`);

    const { data } = await octokit
      .request(rawGitHubUrl, {
        request: { retry: { retries: 3, retryAfter: 3 } },
      })
      .catch((error) => {
        if (error.status !== 404) throw error;

        return { data: null };
      });

    if (!data) {
      commitLogger.warn("File not found");
      continue;
    }

    /** @type { import("..").Contributors } */
    let contributors;
    try {
      const parsed = JSON.parse(data);
      contributors = parsed.contributors.reduce((contributors, contributor) => {
        const constributions = contributor.contributions.map((type) =>
          type.toLowerCase()
        );
        const login = contributor.login.toLowerCase();
        return {
          ...contributors,
          [login]: constributions,
        };
      }, {});
    } catch {
      commitLogger.warn("File has invalid JSON");
      // ignore invalid JSON
      continue;
    }

    numValidCommits += 1;

    commitsWithContributors.push({
      ...commit,
      contributors,
    });
  }

  for (const { contributors, ...commit } of commitsWithContributors) {
    const commitLogger = repoLogger.child({
      sha: commit.sha,
    });

    const diff = getDiff(previousContributors, contributors);
    if (diff.added.length === 0) {
      commitLogger.warn(
        { previousCommitSha: previousCommitSha, url: commit.url },
        "File has no new contributors"
      );
      continue;
    }

    previousContributors = contributors;
    previousCommitSha = commit.sha;
    numCommitsWithEndorsements += 1;

    /** @type {import("..").Endorsements} */
    const endorsements = diff.added.reduce((endorsements, [path, value]) => {
      const [login] = path.toLowerCase().split("/");

      if (!endorsements[login]) {
        endorsements[login] = [];
      }

      try {
        endorsements[login].push(value.toLowerCase());
      } catch {
        // ignore invalid endorsement syntax. That includes when folks add users with empty contributions
        // example: https://github.com/MikeTRose/snipe-it-mtr/commit/415ae5854fcf645345cf3625389d65c0e6558731
      }

      return endorsements;
    }, {});

    commitsWithEndorsements.push({
      ...commit,
      endorsements,
    });
  }

  repoLogger.info(
    { numCommits: commits.length, numValidCommits, numCommitsWithEndorsements },
    `Loaded endorsements from commits`
  );

  writeDebugFile({
    log: repoLogger,
    owner,
    repo,
    path,
    name: "commitsWithEndorsements",
    data: commitsWithEndorsements,
  });

  // find IDs for users that have been endorsed
  // TODO: `contributors` might contain the user ID in `avatar_url`
  const userLoginsWithoutKnownId = commitsWithEndorsements
    .map(({ endorsements }) => Object.keys(endorsements))
    .flat()
    .filter((login) => !state.userIdByLogin[login]);

  repoLogger.info(
    { newLoginsCount: userLoginsWithoutKnownId.length },
    "Looking up user IDs"
  );

  const newUserIdByLogin = await loginsToLoginById(
    octokit,
    userLoginsWithoutKnownId
  );

  state.userIdByLogin = {
    ...state.userIdByLogin,
    ...newUserIdByLogin,
  };

  writeDebugFile({
    log: repoLogger,
    owner,
    repo,
    path,
    name: "newUserIdByLogin",
    data: newUserIdByLogin,
  });

  // create endorsements
  for (const version of commitsWithEndorsements) {
    // If the commit has no assigned GitHub user for the author or committer,
    // and there is no associated pull request, we cannot create the endorsement
    // because we cannot determine who created it.
    if (!version.creatorId) {
      repoLogger.warn(
        {
          sha: version.sha,
          endorsed: Object.keys(version.endorsements),
        },
        "Could not determine creator for endorsement"
      );
      continue;
    }

    for (const [login, types] of Object.entries(version.endorsements)) {
      if (!state.userIdByLogin[login]) {
        repoLogger.warn(
          {
            sha: version.sha,
            login,
          },
          "User no longer exists"
        );
        continue;
      }
      for (const type of types) {
        newEndorsements.push({
          repo_id: repoId,
          creator_user_id: version.creatorId,
          recipient_user_id: state.userIdByLogin[login],

          created_at: version.createdAt,
          source_context_url: version.pullRequestUrl || version.url,
          type,
        });
      }
    }
  }

  repoLogger.info(
    { numEndorsements: state.numEndorsements },
    "Endorsements added"
  );

  return newEndorsements;
}
