#!/usr/bin/env node

process.exitCode = 1;

import run from "../index.js";
import Octokit from "../lib/octokit.js";

const octokit = new Octokit({
  auth: process.env.GITHUB_TOKEN,
});

run(octokit).then(
  () => {
    process.exitCode = 0;
  },
  (error) => console.error(error)
);
