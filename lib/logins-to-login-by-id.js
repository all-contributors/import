// @ts-check

import { slicyBy } from "./array-slice-by.js";
import Octokit from "./octokit.js";

/**
 * @param {InstanceType<Octokit>} octokit
 * @param {string[]} userLogins
 * @returns {Promise<Record<string, number>>}
 */
export async function loginsToLoginById(octokit, userLogins) {
  /** @type {Record<string, number>} */
  const userIdByLogin = {};
  const usersSliced = slicyBy(userLogins, 50);
  for (const userLogins of usersSliced) {
    let result;

    try {
      result = await octokit.graphql(`
        query {
          ${userLogins
            .map(
              (login, index) =>
                `user${index}:user(login:"${login}") { databaseId, login }`
            )
            .join("\n        ")}
        }
      `);
    } catch (error) {
      if (!error.response) throw error;
      result = error.response.data;
    }

    for (const [key, user] of Object.entries(result)) {
      // it's possible that a username no longer exists on GitHub
      if (!user) {
        const index = Number(key.slice(4));
        userIdByLogin[userLogins[index]] = null;
      } else {
        userIdByLogin[user.login.toLowerCase()] = user.databaseId;
      }
    }
  }

  return userIdByLogin;
}
