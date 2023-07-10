# `all-contributors` import script

> Node.js script to import data from `.all-contributorsrc` across public GitHub repositories.

The script creates or updates [data/endorsements.csv](data/endorsements.csv) (relative to where the script is run from) with endorsements sourced from `.all-contributorsrc` files across public GitHub repositories.

## Usage

### Subscribe to updates

In order to be notified about updates, install the [all-contributors-import](https://github.com/apps/all-contributors-import) app on a repository where you want to handle the update.

To see an example of how to handle the update, see [.github/workflows/subscribe.yml](.github/workflows/subscribe.yml).

We only pass the `startSeq` and `endSeq` as part of the update because repository dispatch payloads are limited in size. But you can download the latest version of `data/endorsements.csv` at https://raw.githubusercontent.com/all-contributors/import/main/data/endorsements.csv and then filter out based on the provided sequence numbers.

### CLI

In order to run the import script, you need to define a `GITHUB_TOKEN` environment variable to a personal access token with the `public_repo` scope ([create one](https://github.com/settings/tokens/new?scopes=public_repo&description=all-contributors-import-script)).

```
GITHUB_TOKEN=... npx all-contributors-import
```

If you would like to write the unformated logs to a separate file you can run this command on Linux or macOS

```
GITHUB_TOKEN=... npx all-contributors-import | tee .results/import.jsonl | npx pino-pretty
```

## How it works

1. Find `.all-contributorsrc` files
   1. In public GitHub repositories using [`GET /search/code` API](https://docs.github.com/rest/search#search-code)
   2. Based on existing data in [data/endorsements.csv](data/endorsements.csv)
2. Retrieve commits for each file using GraphQL (as it's easier to retrieve associated pull requests and author user information)
   1. If it's a new file, retrieve all commits
   2. If existing endorsement have been sourced before, retrieve all commits after that
3. Calculate the difference of the `.all-contributorsrc` file for each version and store separate endorsements in `.results/endorsements.csv`

## License

[ISC](LICENSE)
