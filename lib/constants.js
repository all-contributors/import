// @ts-check

/**
 * @type {import("..").SourceFilesColumnKeys}
 */
export const SOURCE_FILES_COLUMNS = [
  "owner_id",
  "owner_login",
  "repo_id",
  "repo_name",
  "path",
  "last_commit_sha",
  "last_updated_at",
  "last_file_sha",
];
export const SOURCE_FILES_PATH = "data/source-files.csv";

/**
 * @type {import("..").DatabaseColumnKeys}
 */
export const ENDORSEMENTS_COLUMNS = [
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
  "source_context_url",
];

export const ENDORSEMENTS_PATH = "data/endorsements.csv";
