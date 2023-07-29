#!/usr/bin/env node

process.exitCode = 1;

import run from "../index.js";
import App from "../lib/octokit.js";

const app = new App({
  appId: process.env.GITHUB_APP_ID,
  privateKey: process.env.GITHUB_PRIVATE_KEY,
});

run(app).then(
  () => {
    process.exitCode = 0;
  },
  (error) => console.error(error)
);
