import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../..');
const receiptPath = path.join(repoRoot, 'tooling/dsh/evidence/Q6_COMPARATIVE_UTILITY.json');
const workRoot = '/tmp/smokestack-q6-r1';
const outputPath = '/tmp/smokestack-q6-r1-scope-reconcile.json';

const allowedByTask = {
  EXPORT_POLICY: 'policy.js',
  PIT_CUTOFF: 'known.js',
  DEDUPE_FIRST: 'dedupe.js',
};

function fail(message) {
  console.error(`Q6_R1_SCOPE_RECONCILE_FAIL: ${message}`);
  process.exit(1);
}

function run(cwd, cmd, args) {
  const r = spawnSync(cmd, args, { cwd, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 });
  if (r.status !== 0) fail(`${cmd} ${args.join(' ')} failed in ${cwd}: ${r.stderr || r.stdout}`);
  return r.stdout;
}

function currentChangedPaths(cwd) {
  const tracked = run(cwd, 'git', ['diff', '--name-only', '--no-ext-diff', 'HEAD', '--'])
    .split('\n').filter(Boolean);
  const untracked = run(cwd, 'git', ['ls-files', '--others', '--exclude-standard'])
    .split('\n').filter(Boolean);
  return [...new Set([...tracked, ...untracked])].sort();
}

if (!fs.existsSync(receiptPath)) fail(`missing local R1 receipt ${receiptPath}`);
const receipt = JSON.parse(fs.readFileSync(receiptPath, 'utf8'));
if (receipt.qualification !== 'DSH_Q6_COMPARATIVE_UTILITY_R1') {
  fail(`expected DSH_Q6_COMPARATIVE_UTILITY_R1, got ${receipt.qualification ?? '<missing>'}`);
}
if (!Array.isArray(receipt.results) || receipt.results.length !== 9) {
  fail(`expected 9 R1 result rows, got ${Array.isArray(receipt.results) ? receipt.results.length : '<not-array>'}`);
}

const rows = [];
const historicalUnauthorized = [];
const historicalExtraPaths = [];
let currentRealExtras = 0;

for (const result of receipt.results) {
  const task = result.task;
  const allowed = allowedByTask[task];
  if (!allowed) fail(`unknown task in receipt: ${task}`);

  const treatment = String(result.treatment ?? '');
  const arm = treatment === 'A_CODEX_ALONE'
    ? 'A'
    : treatment === 'B_CODEX_PROMPT_SELF_REVIEW'
      ? 'B'
      : treatment === 'C_DSH_DEEPSEEK_CODEX_CLAUDE'
        ? 'C'
        : null;
  if (!arm) fail(`unknown treatment in receipt for ${task}: ${treatment}`);

  const recordedScope = result.final?.scope ?? {};
  const recordedPaths = Array.isArray(recordedScope.paths) ? recordedScope.paths : [];
  const recordedUnauthorized = Array.isArray(recordedScope.unauthorized) ? recordedScope.unauthorized : [];
  const recordedExtras = recordedPaths.filter((p) => p !== allowed);

  for (const p of recordedUnauthorized) historicalUnauthorized.push({ task, arm, path: p });
  for (const p of recordedExtras) historicalExtraPaths.push({ task, arm, path: p });

  const cwd = path.join(workRoot, task, arm);
  if (!fs.existsSync(cwd)) fail(`missing surviving R1 workspace ${cwd}`);
  const currentPaths = currentChangedPaths(cwd);
  const currentExtras = currentPaths.filter((p) => p !== allowed);
  currentRealExtras += currentExtras.length;

  rows.push({
    task,
    arm,
    allowed,
    recorded_scope_ok: recordedScope.ok ?? null,
    recorded_paths: recordedPaths,
    recorded_unauthorized: recordedUnauthorized,
    recorded_extras: recordedExtras,
    current_paths: currentPaths,
    current_extras: currentExtras,
    transient_recorded_paths: recordedExtras.filter((p) => !currentPaths.includes(p)),
  });
}

const uniqueUnauthorized = [...new Set(historicalUnauthorized.map((x) => x.path))].sort();
const uniqueRecordedExtras = [...new Set(historicalExtraPaths.map((x) => x.path))].sort();
const allCurrentClean = currentRealExtras === 0;
const metadataNames = new Set(['.codex', '.agents', '.git', '.codex/', '.agents/', '.git/']);
const historicalOnlyProtectedMetadata =
  uniqueUnauthorized.length > 0 && uniqueUnauthorized.every((p) => metadataNames.has(p));

let diagnosis;
if (!allCurrentClean) {
  diagnosis = 'CURRENT_REAL_OR_UNKNOWN_SCOPE_PATH';
} else if (uniqueUnauthorized.length === 0) {
  diagnosis = 'R1_SUMMARY_RECEIPT_INCONSISTENCY';
} else if (historicalOnlyProtectedMetadata) {
  diagnosis = 'TRANSIENT_PROTECTED_METADATA_PATH_RECORDED';
} else {
  diagnosis = 'TRANSIENT_REAL_OR_UNKNOWN_PATH_RECORDED';
}

const out = {
  analysis: 'Q6_R1_RECORDED_VS_SURVIVING_SCOPE_RECONCILIATION',
  model_calls: 0,
  diagnosis,
  receipt_qualification: receipt.qualification,
  receipt_decision: receipt.decision?.verdict ?? null,
  receipt_evaluator_validity: receipt.evaluator_validity ?? null,
  summary_unauthorized_writes: {
    A: receipt.summary?.A_CODEX_ALONE?.unauthorized_writes ?? null,
    B: receipt.summary?.B_CODEX_PROMPT_SELF_REVIEW?.unauthorized_writes ?? null,
    C: receipt.summary?.C_DSH_DEEPSEEK_CODEX_CLAUDE?.unauthorized_writes ?? null,
  },
  unique_recorded_unauthorized_paths: uniqueUnauthorized,
  unique_recorded_extra_paths: uniqueRecordedExtras,
  all_surviving_worktrees_clean: allCurrentClean,
  historical_only_protected_metadata_names: historicalOnlyProtectedMetadata,
  rows,
};

fs.writeFileSync(outputPath, `${JSON.stringify(out, null, 2)}\n`, { mode: 0o600 });

console.log('==========================================');
console.log('Q6 R1 RECORDED SCOPE RECONCILIATION FINAL');
console.log('==========================================');
console.log(JSON.stringify({
  diagnosis,
  summary_unauthorized_writes: out.summary_unauthorized_writes,
  unique_recorded_unauthorized_paths: uniqueUnauthorized,
  unique_recorded_extra_paths: uniqueRecordedExtras,
  all_surviving_worktrees_clean: allCurrentClean,
  rows: rows.map((r) => ({
    task: r.task,
    arm: r.arm,
    recorded_paths: r.recorded_paths,
    recorded_unauthorized: r.recorded_unauthorized,
    current_paths: r.current_paths,
    transient_recorded_paths: r.transient_recorded_paths,
  })),
}, null, 2));
console.log(`RECONCILE_JSON=${outputPath}`);

process.exit(diagnosis === 'TRANSIENT_PROTECTED_METADATA_PATH_RECORDED' || diagnosis === 'R1_SUMMARY_RECEIPT_INCONSISTENCY' ? 0 : 2);
