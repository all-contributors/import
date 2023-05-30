import stats from "./.results/stats.json" assert { type: "json" };

const data = {
  repositories: stats.repositories.length,
  uniqueRepositories: [...new Set(stats.repositories)].length,
  users: stats.users.length,
  uniqueUsers: [...new Set(stats.users)].length,
  parseErrors: stats.parseErrors.length,
  contributions: stats.contributions.length,
  contributionsByType: Object.fromEntries(
    Object.entries(
      stats.contributions.reduce(
        (byType, contribution) => ({
          ...byType,
          [contribution]: (byType[contribution] || 0) + 1,
        }),
        {}
      )
    ).sort((a, b) => b[1] - a[1])
  ),
};

console.log("");
console.log(data);
console.log("");
