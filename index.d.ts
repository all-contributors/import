import { Endpoints } from "@octokit/types";
import { Octokit } from "@octokit/core";

export default function main(octokit: Octokit): Promise<void>;

// -- static columns
// id uuid default uuid_generate_v4() not null,
// creator_user_id bigint not null references public.users (id) on delete cascade on update cascade,
// recipient_user_id bigint not null references public.users (id) on delete cascade on update cascade,
// repo_id bigint not null references public.repos (id) on delete cascade on update cascade,
// created_at timestamp without time zone not null default now(),
// updated_at timestamp without time zone not null default now(),
// deleted_at timestamp without time zone default null,

// -- elastic columns
// -- example: doc
// type character varying(20) not null,
// source_comment_url character varying(500) not null,
// source_context_url character varying(500) not null,

export type DatabaseColumns = {
  /* GitHub user ID for creatore of the endorsement */
  creator_user_id: number;
  /* GitHub user ID for recipient of the endorsement */
  recipient_user_id: number;
  /* GitHub repository ID */
  repo_id: number;
  /* Timestamp of when the endorsement was created */
  created_at: string;
  /* emoji key, see https://allcontributors.org/docs/en/emoji-key */
  type: string;
  /* URL to the comment that triggered the endorsement (for app users) */
  source_comment_url?: string;
  /* URL to the context of the comment that initiated the endorsement. E.g. a comment URL or a commit URL */
  source_context_url: string;
};

export type Commit = {
  createdAt: string;
  sha: string;
  url: string;
  pullRequestUrl?: string;
  creatorId: number;
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
