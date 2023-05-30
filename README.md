# `all-contributors` import script

> Node.js script to import data from `.all-contributorsrc` across public GitHub repositories.

The script does the following:

1. Search for `.all-contributorsrc` files using the [`GET /search/code` API](https://docs.github.com/rest/search#search-code)
2. Retrieve all commits for each file using GraphQL (as it's easier to retrieve associated pull requests and author user information)
3. Calculate the difference of the `.all-contributorsrc` file for each version and store separate endorsements in `.results/endorsements.csv`

In order to run the import script, you need to define a `GITHUB_TOKEN` environment variable to a personal access token with the `public_repo` scope ([create one](https://github.com/settings/tokens/new?scopes=public_repo&description=all-contributors-import-script)).

Run the import

```
npm run import
```

If you would like to write the unformated logs to a separate file you can run this command on Linux or macOS

```
node import.js | tee .results/import.jsonnd | npx pino-pretty
```

## License

[ISC](LICENSE)
