# `import`

> data from `.all-contributorsrc` across public GitHub repositories. 

This repository is a self-updating data provider of endorsements that are gather automatically across public GitHub repositories.

You can find the latest data at [data/endorsements.csv](data/endorsements.csv)

## Usage

### Subscribe to updates

In order to be notified about updates, install the [all-contributors-import](https://github.com/apps/all-contributors-import) app on a repository where you want to handle the update.

To see an example of how to handle updates, see [.github/workflows/subscribe.yml](.github/workflows/subscribe.yml).

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

This repository consists of 

1. The import script (entry point: [/bin/cli.js](/bin/cli.js))
2. The imported data: [/data](/data)
3. A workflow to run the import each day: [.github/workflows/update.yml](.github/workflows/update.yml)
4. A script to notify everyone interested about an update: [scripts/notify.js](scripts/notify.js)

### The import script

1. Find `.all-contributorsrc` files
   1. In public GitHub repositories using [`GET /search/code` API](https://docs.github.com/rest/search#search-code)
   2. Based on existing data in [data/endorsements.csv](data/endorsements.csv)
   3. Update `data/endorsements.csv` with all new files and latest update meta data
2. Retrieve commits for each file using GraphQL (as it's easier to retrieve associated pull requests and author user information)
   1. If it's a new file, retrieve all commits
   2. If existing endorsement have been sourced before, retrieve all commits after that
3. Calculate the difference of the `.all-contributorsrc` file for each version and store separate endorsements in `.results/endorsements.csv`

### The update notification

The [scripts/notify.js](scripts/notify.js) script is [called as part of the daily update workflow](https://github.com/all-contributors/import/blob/4999950a419c25072f5c94aba7dc91ac9ba74fb9/.github/workflows/update.yml#L34-L40). The script is called with the credentials of the [all-contributors-import](https://github.com/apps/all-contributors-import) app. The script iterates through all repositories the app is installed in and creates a repository dispatch event with `event_type` set to `all-contributors-import:update` and `client_payload` set to `{ startSeq, endSeq }`

## Sponsors

[![OpenSauced logo](https://github.com/open-sauced/assets/blob/main/logos/logo-on-dark.png)](https://opensauced.pizza?utm_source=allcontributorss&utm_medium=github&utm_campaign=sponsorship)

[OpenSauced](https://opensauced.pizza?utm_source=allcontributorss&utm_medium=github&utm_campaign=sponsorship) provides insights into open source projects by using data science in git commits. 

## License

[ISC](LICENSE)
