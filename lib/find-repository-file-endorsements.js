// @ts-check

import { getDiff } from "json-difference";

import { loginsToLoginById } from "./logins-to-login-by-id.js";
import { writeDebugFile } from "./write-debug-files.js";
import Octokit from "./octokit.js";
import { getAllCommitsForFile } from "./get-all-commits-for-file.js";

/**
 * Find all commits for a `.all-contributorsrc` file in a repository. Load the changes
 * for each commit and calculate new endorsements.
 *
 * @param {InstanceType<Octokit>} octokit
 * @param {import("pino").Logger} log
 * @param {import("..").State} state
 * @param {import('..').SourceFile} sourceFile
 * @returns {Promise<{endorsements: import("..").DatabaseColumns[], lastCommitSha: string, lastUpdatedAt: string} | undefined>}
 */
export async function findRepositoryFileEndorsements(
  octokit,
  log,
  state,
  sourceFile
) {
  const { ownerId, owner, repoId, repo, path } = sourceFile;

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

  // If we have a lastUpdatedAt date, we can skip it and all commits before it.
  // The only way we can do it however is with a timestamp. We add 1 second to
  // the lastUpdatedAt date to not include the last commit we already know.
  const since = sourceFile.lastUpdatedAt
    ? new Date(
        new Date(sourceFile.lastUpdatedAt).getTime() + 1000
      ).toISOString()
    : undefined;

  const commits = await getAllCommitsForFile(octokit, owner, repo, path, since);

  // Commits can be empty if we pass `since`
  if (commits.length === 0) return;

  const lastCommitSha = commits[0].sha;
  const lastUpdatedAt = commits[0].createdAt;

  // .revers mutates the array
  commits.reverse();

  for (const commit of commits) {
    commit.path = ".all-contributorsrc";
    const rawGitHubUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${commit.sha}/${commit.path}`;

    const commitLogger = repoLogger.child({
      sha: commit.sha,
    });

    commitLogger.debug({ url: commit.url }, `Loading file content`);

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
          owner_id: ownerId,
          owner_login: owner,
          repo_id: repoId,
          repo_name: repo,
          creator_user_id: version.creatorId,
          creator_user_login: version.creatorLogin,
          recipient_user_id: state.userIdByLogin[login],
          recipient_user_login: login,

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

  return { endorsements: newEndorsements, lastCommitSha, lastUpdatedAt };
}
