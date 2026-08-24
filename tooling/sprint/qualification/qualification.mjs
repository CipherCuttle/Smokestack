import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const sprintDir = path.resolve(here, '..');
const liveRunner = path.join(sprintDir, 'live-sprint.mjs');
const mcpServer = path.join(here, 'literature-mcp-fixture.mjs');
const fixture = '/tmp/smokestack-pr00b-live-qualification';
const receipt = '/tmp/smokestack-pr00b-live-qualification-receipt.json';
const specPath = '/tmp/smokestack-pr00b-live-qualification-spec.json';

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, {
    cwd: opts.cwd,
    env: { ...process.env, ...(opts.env ?? {}) },
    encoding: 'utf8',
    stdio: opts.inherit ? 'inherit' : undefined,
    timeout: opts.timeoutMs ?? 120000,
    maxBuffer: 16 * 1024 * 1024,
  });
  return {
    exit: r.status ?? (r.error ? 125 : 0),
    stdout: typeof r.stdout === 'string' ? r.stdout : '',
    stderr: typeof r.stderr === 'string' ? r.stderr : (r.error ? String(r.error) : ''),
  };
}
function fail(message, code = 1) {
  console.error(`PR00B_LIVE_QUALIFICATION_FAIL: ${message}`);
  process.exit(code);
}
function write(rel, content) {
  const target = path.join(fixture, rel);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content, 'utf8');
}

if (process.version !== 'v24.19.0') fail(`Node v24.19.0 required; got ${process.version}`);
fs.rmSync(fixture, { recursive: true, force: true });
fs.rmSync(receipt, { force: true });
fs.rmSync(specPath, { force: true });
fs.mkdirSync(fixture, { recursive: true });

write('src/normalize.js', `export function normalizeName(value) {\n  throw new Error('TODO');\n}\n`);
write('src/dedupe.js', `export function firstById(records) {\n  return [...new Map(records.map((record) => [record.id, record])).values()];\n}\n`);
write('src/cutoff.js', `export function knownAt(records, cutoffMs) {\n  return records.filter((record) => record.observedAtMs < cutoffMs);\n}\n`);
write('src/summary.js', `export function summarize(records) {\n  throw new Error('TODO');\n}\n`);
write('test/normalize.test.mjs', `import test from 'node:test';\nimport assert from 'node:assert/strict';\nimport { normalizeName } from '../src/normalize.js';\ntest('normalizes deterministic labels', () => {\n  assert.equal(normalizeName('  Alpha  Beta!! '), 'alpha-beta');\n  assert.equal(normalizeName('---Gamma---'), 'gamma');\n});\n`);
write('test/dedupe.test.mjs', `import test from 'node:test';\nimport assert from 'node:assert/strict';\nimport { firstById } from '../src/dedupe.js';\ntest('first valid id wins', () => {\n  const a1={id:'a',v:1}, a2={id:'a',v:2}, b={id:'b'}, bad={id:''};\n  assert.deepEqual(firstById([a1,a2,b,bad]), [a1,b]);\n});\n`);
write('test/cutoff.test.mjs', `import test from 'node:test';\nimport assert from 'node:assert/strict';\nimport { knownAt } from '../src/cutoff.js';\ntest('PIT filter is inclusive and fail-closed on malformed timestamps', () => {\n  const exact={id:'exact',observedAtMs:20}, early={id:'early',observedAtMs:5};\n  const malformed=[{id:'s',observedAtMs:'10'},{id:'n',observedAtMs:NaN},{id:'i',observedAtMs:Infinity},{}];\n  assert.deepEqual(knownAt([exact,...malformed,early],20), [exact,early]);\n});\n`);
write('test/summary.test.mjs', `import test from 'node:test';\nimport assert from 'node:assert/strict';\nimport { summarize } from '../src/summary.js';\ntest('summary counts and sorts unique ids without mutation', () => {\n  const input=[{id:'b'},{id:'a'},{id:'b'},{id:''},{}];\n  const snapshot=JSON.stringify(input);\n  assert.deepEqual(summarize(input), { count:2, ids:['a','b'] });\n  assert.equal(JSON.stringify(input), snapshot);\n});\n`);
write('package.json', `${JSON.stringify({ type: 'module', private: true }, null, 2)}\n`);

let r = run('git', ['init', '-q'], { cwd: fixture });
if (r.exit) fail(r.stderr);
run('git', ['config', 'user.email', 'smokestack-sprint@example.invalid'], { cwd: fixture });
run('git', ['config', 'user.name', 'Smokestack Sprint Qualification'], { cwd: fixture });
r = run('git', ['add', '.'], { cwd: fixture });
if (r.exit) fail(r.stderr);
r = run('git', ['commit', '-qm', 'qualification baseline'], { cwd: fixture });
if (r.exit) fail(r.stderr);

const spec = {
  sprint_id: 'PR00B_LIVE_AUTONOMOUS_SPRINT_V0',
  objective: 'Prove one-command autonomous multi-task execution using FAST, REVIEWED, GOVERNED+MCP research, dependency progression, host verification, independent TEN_STACK review, clean commits, and terminal closure.',
  tasks: [
    {
      id: 'T01_NORMALIZE_FAST', objective: 'Implement deterministic label normalization.', depends_on: [], mode: 'FAST',
      acceptance: ['Trim surrounding whitespace.','Lowercase ASCII letters.','Convert whitespace runs to one hyphen.','Remove characters outside ASCII letters, digits, and hyphen.','Collapse repeated hyphens and trim edge hyphens.'],
      authority: { write: ['src/normalize.js'] }, research_required: false,
      verify: { command: process.execPath, args: ['--test', 'test/normalize.test.mjs'] },
    },
    {
      id: 'T02_DEDUPE_REVIEWED', objective: 'Implement first-wins deterministic deduplication for valid non-empty string ids.', depends_on: ['T01_NORMALIZE_FAST'], mode: 'REVIEWED',
      acceptance: ['Only non-empty string ids are valid.','First occurrence wins.','Preserve winning object references and order.','Do not mutate input.'],
      authority: { write: ['src/dedupe.js'] }, research_required: false,
      verify: { command: process.execPath, args: ['--test', 'test/dedupe.test.mjs'] },
    },
    {
      id: 'T03_PIT_GOVERNED_RESEARCH', objective: 'Implement a point-in-time cutoff filter with explicit inclusive boundary and fail-closed timestamp validation.',
      research_question: 'What temporal-filter properties prevent future-information leakage and coercion contamination in point-in-time datasets?', depends_on: ['T01_NORMALIZE_FAST'], mode: 'GOVERNED',
      acceptance: ['observedAtMs must be a finite number.','Include records exactly at cutoffMs.','Exclude missing, string, NaN, Infinity, and -Infinity timestamps.','Preserve original object references and input order.','Do not mutate input.'],
      authority: { write: ['src/cutoff.js'] }, research_required: true,
      verify: { command: process.execPath, args: ['--test', 'test/cutoff.test.mjs'] },
    },
    {
      id: 'T04_INTEGRATION_REVIEWED', objective: 'Implement a deterministic non-mutating summary of unique valid ids.', depends_on: ['T02_DEDUPE_REVIEWED','T03_PIT_GOVERNED_RESEARCH'], mode: 'REVIEWED',
      acceptance: ['Ignore invalid ids.','Count unique valid ids.','Return ids sorted lexicographically.','Do not mutate input.'],
      authority: { write: ['src/summary.js'] }, research_required: false,
      verify: { command: process.execPath, args: ['--test', 'test/summary.test.mjs'] },
    },
  ],
};
fs.writeFileSync(specPath, `${JSON.stringify(spec, null, 2)}\n`, 'utf8');

console.log('==========================================');
console.log('PR-00B LIVE AUTONOMOUS SPRINT QUALIFICATION');
console.log('==========================================');
console.log(`fixture=${fixture}`);
console.log('model-backed execution begins after this line');

const child = spawnSync(process.execPath, [
  liveRunner, '--live', '--spec', specPath, '--workdir', fixture, '--receipt', receipt,
  '--research-mcp-command', process.execPath, '--research-mcp-arg', mcpServer,
], { cwd: sprintDir, env: process.env, stdio: 'inherit', timeout: 3600000 });

if ((child.status ?? 125) !== 0) fail(`live sprint runner exited ${child.status ?? 125}`, child.status ?? 2);
if (!fs.existsSync(receipt)) fail('live runner exited successfully without receipt');
const evidence = JSON.parse(fs.readFileSync(receipt, 'utf8'));
const allPass = evidence.final?.state === 'PASS' && evidence.clean_worktree === true && Object.values(evidence.final?.tasks ?? {}).every((task) => task.state === 'PASS');
if (!allPass) fail('receipt does not prove a clean all-PASS sprint');

const log = run('git', ['log', '--format=%s'], { cwd: fixture });
const sprintCommits = log.stdout.split('\n').filter((line) => line.startsWith('sprint: '));
if (sprintCommits.length !== 4) fail(`expected 4 host checkpoint commits, found ${sprintCommits.length}`);

console.log('\n==========================================');
console.log('PR-00B LIVE QUALIFICATION FINAL');
console.log('==========================================');
console.log(JSON.stringify({
  qualification: 'PR00B_LIVE_AUTONOMOUS_SPRINT_V0', terminal: evidence.final.state, clean_worktree: evidence.clean_worktree,
  checkpoint_commits: sprintCommits.length,
  task_states: Object.fromEntries(Object.entries(evidence.final.tasks).map(([id, task]) => [id, task.state])),
  checkpoint_sha256: evidence.final.sha256, receipt,
}, null, 2));
console.log('PR00B_LIVE_AUTONOMOUS_SPRINT_PASS');
