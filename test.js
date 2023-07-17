// @ts-check

import readline from "node:readline";
import { createReadStream } from "node:fs";

import { ENDORSEMENTS_COLUMNS, ENDORSEMENTS_PATH } from "./lib/constants.js";

const rl = readline.createInterface({
  input: createReadStream(ENDORSEMENTS_PATH),
});

let seq = 0;

const newLines = [];
const errors = [];
let hasSeqError = false;
let lastSeq;

for await (const line of rl) {
  const columns = line.split(",");
  const endorsement = Object.fromEntries(
    columns.map((value, index) => [ENDORSEMENTS_COLUMNS[index], value])
  );

  if (endorsement.owner_id === "owner_id") {
    newLines.push(line);
    continue;
  }

  if (!line.trim()) {
    errors.push(`Wrong number of columns after seq #${lastSeq}`);
    continue;
  }

  lastSeq = seq;

  if (columns.length !== ENDORSEMENTS_COLUMNS.length) {
    errors.push(`Wrong number of columns at seq #${endorsement.seq}`);
  }

  const parts = line.split(",");
  newLines.push(`${++seq},` + parts.slice(1).join(","));

  if (Number(endorsement.seq) !== seq && !hasSeqError) {
    errors.push(`${endorsement.seq} should be ${seq}`);
    hasSeqError = true;
  }
}

if (errors.length) {
  console.log(`Errors in data found:\n\n- ${errors.join("\n- ")}`);
  process.exit(1);
}

console.log("ok");
