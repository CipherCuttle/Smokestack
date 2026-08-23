import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const q5Receipt = '/tmp/smokestack-q5/final-receipt.json';
const q5Continue = '/tmp/smokestack-q5/continue-q5.sh';
const q5Counter = '/tmp/smokestack-q5/parent-requests.json';
const q5ResumeProxy = path.join(here, 'q5-resume-proxy.mjs');
const q5ProxyPort = 18731;

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

function portOpen(port) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: '127.0.0.1', port });
    const done = (value) => {
      socket.destroy();
      resolve(value);
    };
    socket.setTimeout(500);
    socket.once('connect', () => done(true));
    socket.once('timeout', () => done(false));
    socket.once('error', () => done(false));
  });
}

async function waitForPort(port, attempts = 50) {
  for (let i = 0; i < attempts; i += 1) {
    if (await portOpen(port)) return true;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return false;
}

function validatePersistedCounter() {
  if (!fs.existsSync(q5Counter)) {
    throw new Error(`missing persisted Q5 parent counter: ${q5Counter}`);
  }

  let state;
  try {
    state = JSON.parse(fs.readFileSync(q5Counter, 'utf8'));
  } catch {
    throw new Error(`invalid persisted Q5 parent counter JSON: ${q5Counter}`);
  }

  const max = Number(state.max_requests);
  const allowed = Number(state.allowed_requests);
  const blocked = Number(state.blocked_requests);

  if (
    max !== 8 ||
    !Number.isInteger(allowed) ||
    allowed < 0 ||
    allowed > max ||
    !Number.isInteger(blocked) ||
    blocked < 0
  ) {
    throw new Error(
      `persisted Q5 parent counter violates invariants: max=${state.max_requests} allowed=${state.allowed_requests} blocked=${state.blocked_requests}`,
    );
  }

  return { max, allowed, blocked };
}

async function ensureQ5Proxy() {
  if (await portOpen(q5ProxyPort)) {
    console.log('Q6_ENTRY: existing Q5 parent-cap proxy is alive.');
    return null;
  }

  const counter = validatePersistedCounter();
  console.log(
    `Q6_ENTRY: restarting Q5 parent-cap proxy from persisted budget ${counter.allowed}/${counter.max}.`,
  );

  const child = spawn(process.execPath, [q5ResumeProxy], {
    cwd: here,
    env: {
      ...process.env,
      PORT: String(q5ProxyPort),
      COUNT_FILE: q5Counter,
    },
    stdio: ['ignore', 'inherit', 'inherit'],
  });

  const ready = await waitForPort(q5ProxyPort);
  if (!ready) {
    child.kill('SIGTERM');
    throw new Error('resumed Q5 parent-cap proxy did not become ready');
  }

  return child;
}

async function stopChild(child) {
  if (!child || child.exitCode !== null) return;
  child.kill('SIGTERM');
  await new Promise((resolve) => {
    const timer = setTimeout(() => {
      if (child.exitCode === null) child.kill('SIGKILL');
      resolve();
    }, 2000);
    child.once('exit', () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

if (!fs.existsSync(q5Receipt)) {
  console.log('Q6_ENTRY: Q5 receipt missing; attempting automatic Q5 resume.');

  if (!fs.existsSync(q5Continue)) {
    console.error(`Q6_ENTRY_FAIL: missing Q5 receipt and resume runner: ${q5Continue}`);
    console.error('Q5 local qualification artifacts are unavailable; refusing to invent or reconstruct evidence.');
    process.exit(1);
  }

  let resumedProxy = null;
  try {
    resumedProxy = await ensureQ5Proxy();

    const q5Exit = run(q5Continue, [], { timeoutMs: 1_500_000 });
    if (q5Exit !== 0) {
      console.error(`Q6_ENTRY_FAIL: automatic Q5 resume exited ${q5Exit}`);
      process.exitCode = q5Exit;
    } else if (!fs.existsSync(q5Receipt)) {
      console.error(`Q6_ENTRY_FAIL: Q5 resume completed but receipt is still missing: ${q5Receipt}`);
      process.exitCode = 1;
    } else {
      console.log('Q6_ENTRY: Q5 receipt created; proceeding to Q6.');
    }
  } catch (error) {
    console.error(`Q6_ENTRY_FAIL: ${error.message}`);
    process.exitCode = 1;
  } finally {
    await stopChild(resumedProxy);
  }

  if (process.exitCode) process.exit(process.exitCode);
}

const q6Exit = run(process.execPath, [path.join(here, 'q6-runner.mjs')]);
process.exit(q6Exit);
