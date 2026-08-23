import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const q5Receipt = '/tmp/smokestack-q5/final-receipt.json';
const q5Continue = '/tmp/smokestack-q5/continue-q5.sh';

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, {
    cwd: opts.cwd ?? here,
    env: process.env,
    stdio: 'inherit',
    timeout: opts.timeoutMs ?? 1_800_000,
  });
  if (r.error) {
    console.error(`Q6_ENTRY_FAIL: ${r.error.message}`);
    process.exit(125);
  }
  return r.status ?? 125;
}

if (!fs.existsSync(q5Receipt)) {
  console.log('Q6_ENTRY: Q5 receipt missing; attempting automatic Q5 resume.');

  if (!fs.existsSync(q5Continue)) {
    console.error(`Q6_ENTRY_FAIL: missing Q5 receipt and resume runner: ${q5Continue}`);
    console.error('Q5 local qualification artifacts are unavailable; refusing to invent or reconstruct evidence.');
    process.exit(1);
  }

  const q5Exit = run(q5Continue, [], { timeoutMs: 1_500_000 });
  if (q5Exit !== 0) {
    console.error(`Q6_ENTRY_FAIL: automatic Q5 resume exited ${q5Exit}`);
    process.exit(q5Exit);
  }

  if (!fs.existsSync(q5Receipt)) {
    console.error(`Q6_ENTRY_FAIL: Q5 resume completed but receipt is still missing: ${q5Receipt}`);
    process.exit(1);
  }

  console.log('Q6_ENTRY: Q5 receipt created; proceeding to Q6.');
}

const q6Exit = run(process.execPath, [path.join(here, 'q6-runner.mjs')]);
process.exit(q6Exit);
