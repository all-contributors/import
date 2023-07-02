import { Endpoints } from "@octokit/types";
import { Octokit } from "@octokit/core";

export default function main(octokit: Octokit): Promise<void>;

export type DatabaseColumnKeys = [
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
  "source_context_url"
];

export type DatabaseColumns = {
  /* GitHub repository owner ID */
  owner_id: number;
  /* GitHub repository owner ID */
  owner_login: string;
  /* GitHub repository ID */
  repo_id: number;
  /* GitHub string name */
  repo_name: string;
  /* GitHub user ID of the endorsing user */
  creator_user_id: number;
  /* GitHub user login of the endorsing user */
  creator_user_login: string;
  /* GitHub user ID of the endorsed user */
  recipient_user_id: number;
  /* GitHub user login of the endorsed user */
  recipient_user_login: string;
  /* Timestamp of when the endorsement was created */
  created_at: string;
  /* emoji key, see https://allcontributors.org/docs/en/emoji-key */
  type: string;
  /* URL to the context of the comment that initiated the endorsement. E.g. a comment URL or a commit URL */
  source_context_url: string;
};

export type Commit = {
  createdAt: string;
  sha: string;
  url: string;
  pullRequestUrl?: string;
  creatorId: number;
  creatorLogin: string;
  repoId: number;
};

export type CommitMapFn = (
  response: Endpoints["GET /repos/{owner}/{repo}/commits"]["response"]
) => Commit[];

export type CommitWithContributors = Commit & {
  contributors: Contributors;
};
export type CommitWithEndorsements = Commit & {
  /** array of endorsement types by user login */
  endorsements: Endorsements;
};
export type Contributors = Record<string, string[]>;
export type Endorsements = Record<string, string[]>;
export type User = {
  id: number;
  login: string;
};

export type State = {
  userIdByLogin: Record<string, number>;
  numEndorsements: number;
};
