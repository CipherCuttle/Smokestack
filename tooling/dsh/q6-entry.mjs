import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const q5Receipt = '/tmp/smokestack-q5/final-receipt.json';
const q5Continue = '/tmp/smokestack-q5/continue-q5.sh';
const q5Counter = '/tmp/smokestack-q5/parent-requests.json';
const q5ResumeProxy = path.join(here, 'q5-resume-proxy.mjs');
const q6Runner = path.join(here, 'q6-runner-r1.mjs');

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, {
    cwd: opts.cwd ?? here,
    env: { ...process.env, ...(opts.env ?? {}) },
    stdio: 'inherit',
    timeout: opts.timeoutMs ?? 1_800_000,
  });
  if (r.error) {
    console.error(`Q6_ENTRY_FAIL: ${r.error.message}`);
    process.exit(125);
  }
  return r.status ?? 125;
}

function proxyAlive() {
  const r = spawnSync('bash', ['-c', 'echo >/dev/tcp/127.0.0.1/18731'], {
    stdio: 'ignore',
    timeout: 2_000,
  });
  return r.status === 0;
}

if (!fs.existsSync(q5Receipt)) {
  console.log('Q6_ENTRY: Q5 receipt missing; attempting automatic Q5 resume.');

  if (!fs.existsSync(q5Continue)) {
    console.error(`Q6_ENTRY_FAIL: missing Q5 receipt and resume runner: ${q5Continue}`);
    console.error('Q5 local qualification artifacts are unavailable; refusing to invent or reconstruct evidence.');
    process.exit(1);
  }

  let proxyPid = null;
  if (!proxyAlive()) {
    if (!fs.existsSync(q5Counter)) {
      console.error(`Q6_ENTRY_FAIL: Q5 proxy is dead and persisted counter is missing: ${q5Counter}`);
      process.exit(1);
    }
    const counter = JSON.parse(fs.readFileSync(q5Counter, 'utf8'));
    const allowed = Number(counter.allowed_requests);
    const max = Number(counter.max_requests);
    if (!Number.isInteger(allowed) || !Number.isInteger(max) || allowed < 0 || max !== 8 || allowed > max) {
      console.error('Q6_ENTRY_FAIL: persisted Q5 request budget is invalid; refusing to reset or guess it.');
      process.exit(1);
    }
    console.log(`Q6_ENTRY: restarting Q5 parent-cap proxy from persisted budget ${allowed}/${max}.`);
    const child = spawnSync('bash', ['-c', `node ${JSON.stringify(q5ResumeProxy)} >/tmp/smokestack-q5/resume-proxy.out 2>/tmp/smokestack-q5/resume-proxy.err & echo $!`], {
      encoding: 'utf8',
      env: { ...process.env, COUNT_FILE: q5Counter, PORT: '18731', MAX_PARENT_REQUESTS: '8' },
      timeout: 5_000,
    });
    if (child.status !== 0) {
      console.error(`Q6_ENTRY_FAIL: could not restart Q5 proxy: ${child.stderr}`);
      process.exit(1);
    }
    proxyPid = Number(child.stdout.trim());
    spawnSync('sleep', ['1']);
    if (!proxyAlive()) {
      console.error('Q6_ENTRY_FAIL: restarted Q5 proxy did not become reachable.');
      process.exit(1);
    }
  }

  const q5Exit = run(q5Continue, [], { timeoutMs: 1_500_000 });
  if (proxyPid) {
    spawnSync('kill', [String(proxyPid)], { stdio: 'ignore' });
  }
  if (q5Exit !== 0) {
    console.error(`Q6_ENTRY_FAIL: automatic Q5 resume exited ${q5Exit}`);
    process.exit(q5Exit);
  }
  if (!fs.existsSync(q5Receipt)) {
    console.error(`Q6_ENTRY_FAIL: Q5 resume completed but receipt is still missing: ${q5Receipt}`);
    process.exit(1);
  }
  console.log('Q6_ENTRY: Q5 receipt created; proceeding to Q6 R1.');
}

const q6Exit = run(process.execPath, [q6Runner], { timeoutMs: 3_600_000 });
process.exit(q6Exit);
