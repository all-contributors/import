/**
 * Takes an endorsement object and turns it into a unique key
 * that can be used to avoid duplicates efficiently.
 *
 * @param {{owner_id: number, repo_id: number, creator_user_id: number, recipient_user_id: number}} endorsement
 * @returns {string}
 */
export function endorsementToUniqueKey(endorsement) {
  return [
    endorsement.owner_id,
    endorsement.repo_id,
    endorsement.creator_user_id,
    endorsement.recipient_user_id,
  ].join("-");
}
