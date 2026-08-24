import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import {
  createSprint,
  readyFrontier,
  recordResearch,
  startImplementation,
  finishImplementation,
  finishHostVerify,
  finishReview,
  startRepair,
  finishRepair,
  finishRereview,
  markBlocked,
  checkpoint,
} from './sprint-engine.mjs';
import {
  runSync,
  startOpenRouterProxy,
  writeDshPatches,
  parseReviewGate,
  parseResearchReceipt,
  dshRun,
  ensureMcpPluginInstalled,
} from './dsh-runtime.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../..');

function fail(message, code = 1) {
  console.error(`SPRINT_LIVE_FAIL: ${message}`);
  process.exit(code);
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function changedPaths(cwd) {
  const tracked = runSync('git', ['diff', '--name-only', '--no-ext-diff', 'HEAD', '--'], { cwd });
  if (tracked.exit !== 0) return ['<git-diff-error>'];
  const untracked = runSync('git', ['ls-files', '--others', '--exclude-standard'], { cwd });
  if (untracked.exit !== 0) return ['<git-ls-files-error>'];
  return [...new Set([
    ...tracked.stdout.split('\n').filter(Boolean),
    ...untracked.stdout.split('\n').filter(Boolean),
  ])].sort();
}

function scopeCheck(cwd, allowed) {
  const paths = changedPaths(cwd);
  const unauthorized = paths.filter((p) => !allowed.includes(p));
  return { paths, unauthorized, ok: unauthorized.length === 0 };
}

function hostVerify(cwd, rawTask) {
  const allowed = rawTask.authority?.write ?? [];
  const scope = scopeCheck(cwd, allowed);
  if (!scope.ok) return { pass: false, reason: `UNAUTHORIZED_WRITE:${scope.unauthorized.join(',')}`, scope, command: null };
  const verify = rawTask.verify;
  if (!verify || typeof verify.command !== 'string' || !Array.isArray(verify.args)) {
    return { pass: false, reason: 'MISSING_HOST_VERIFY_COMMAND', scope, command: null };
  }
  const command = runSync(verify.command, verify.args, {
    cwd,
    timeoutMs: Number(verify.timeout_ms ?? 120000),
    env: verify.env ?? {},
  });
  return {
    pass: command.exit === 0,
    reason: command.exit === 0 ? null : `HOST_VERIFY_EXIT_${command.exit}`,
    scope,
    command: {
      command: verify.command,
      args: verify.args,
      exit: command.exit,
      duration_ms: command.duration_ms,
      stdout_tail: command.stdout.slice(-4000),
      stderr_tail: command.stderr.slice(-4000),
    },
  };
}

function commitTask(cwd, taskId, allowed) {
  const add = runSync('git', ['add', '--', ...allowed], { cwd });
  if (add.exit !== 0) throw new Error(`git add failed for ${taskId}: ${add.stderr}`);
  const staged = runSync('git', ['diff', '--cached', '--name-only'], { cwd });
  if (staged.exit !== 0) throw new Error(`cannot inspect staged paths for ${taskId}`);
  const stagedPaths = staged.stdout.split('\n').filter(Boolean).sort();
  const unauthorized = stagedPaths.filter((p) => !allowed.includes(p));
  if (unauthorized.length) throw new Error(`unauthorized staged paths for ${taskId}: ${unauthorized.join(',')}`);
  if (stagedPaths.length === 0) throw new Error(`task ${taskId} produced no staged change`);
  const commit = runSync('git', ['commit', '-qm', `sprint: ${taskId}`], { cwd });
  if (commit.exit !== 0) throw new Error(`git commit failed for ${taskId}: ${commit.stderr}`);
  const head = runSync('git', ['rev-parse', 'HEAD'], { cwd });
  if (head.exit !== 0) throw new Error(`cannot resolve HEAD after ${taskId}`);
  return { head: head.stdout.trim(), staged_paths: stagedPaths };
}

function buildImplementPrompt(rawTask, researchEvidence = null) {
  return [
    'You are the Smokestack sprint orchestrator for one bounded implementation phase.',
    'The parent is read-only. You MUST call subagent_codex_implementer exactly once.',
    'Do not call Claude. Do not make repository edits yourself.',
    `TASK_ID: ${rawTask.id}`,
    `OBJECTIVE: ${rawTask.objective}`,
    `ALLOWED_WRITE_PATHS: ${(rawTask.authority?.write ?? []).join(', ')}`,
    'ACCEPTANCE:',
    ...rawTask.acceptance.map((x) => `- ${x}`),
    researchEvidence ? `RESEARCH_EVIDENCE_JSON: ${JSON.stringify(researchEvidence)}` : 'RESEARCH_EVIDENCE_JSON: null',
    'Tell Codex to make the smallest correct change, modify only the allowed paths, not commit, and not weaken tests/specification.',
    'After the child returns, do not edit anything. Return exactly SPRINT_IMPLEMENT_OK if and only if the child completed successfully.',
  ].join('\n');
}

function buildRepairPrompt(rawTask, reviewText) {
  return [
    'You are the Smokestack sprint orchestrator for the single authorized Critical/High repair.',
    'The parent is read-only. You MUST call subagent_codex_implementer exactly once.',
    'Do not call Claude. Do not make repository edits yourself.',
    `TASK_ID: ${rawTask.id}`,
    `ALLOWED_WRITE_PATHS: ${(rawTask.authority?.write ?? []).join(', ')}`,
    'Repair ONLY the Critical/High findings below while preserving the accepted contract and already-correct behavior.',
    'REVIEW_FINDINGS:',
    reviewText.slice(-12000),
    'Tell Codex not to commit and not to edit tests/specification unless an allowed path explicitly includes them.',
    'After the child returns, do not edit anything. Return exactly SPRINT_REPAIR_OK if and only if the child completed successfully.',
  ].join('\n');
}

function buildReviewPrompt(rawTask, tenStack, phase) {
  return [
    `You are the Smokestack sprint orchestrator for an independent ${phase}.`,
    'The parent is read-only. You MUST call subagent_claude_reviewer exactly once.',
    'Do not call Codex. Do not edit the repository.',
    `TASK_ID: ${rawTask.id}`,
    `OBJECTIVE: ${rawTask.objective}`,
    'ACCEPTANCE:',
    ...rawTask.acceptance.map((x) => `- ${x}`),
    'Apply the complete frozen TEN_STACK_V1 rubric below adversarially.',
    tenStack,
    'Reviewer must inspect the actual diff and relevant files/tests in the current workspace.',
    'Critical/High means a defect that invalidates the objective, acceptance, evidence, security/fail-closed behavior, PIT correctness, or creates a material regression.',
    'Medium/Low findings may be reported but MUST NOT be upgraded merely to force another loop.',
    'The reviewer is read-only and must not repair.',
    'Your final answer must reproduce the reviewer result and contain exactly one final gate line:',
    'REVIEW_GATE: NO_CRITICAL_HIGH',
    'or',
    'REVIEW_GATE: CRITICAL_HIGH_FOUND',
  ].join('\n');
}

function buildResearchPrompt(rawTask) {
  return [
    'You are the Smokestack research worker for one bounded evidence episode.',
    'Codex and Claude are unavailable. The repository is read-only.',
    'You MUST use mcp__literature__search_literature and then mcp__literature__verify_source for at least two returned sources.',
    `TASK_ID: ${rawTask.id}`,
    `RESEARCH_QUESTION: ${rawTask.research_question ?? rawTask.objective}`,
    'Search for evidence that could SUPPORT and evidence that could CONTRADICT the proposed implementation assumption.',
    'Do not invent citations or source identifiers. Use only tool-returned source identity.',
    'If fewer than two independently identified sources can be verified, return RESEARCH_GATE: BLOCKED.',
    'Otherwise return exactly one compact single-line JSON object after EVIDENCE_JSON: with keys question, sources, supports, contradicts, unresolved.',
    'Finish with exactly one gate line: RESEARCH_GATE: PASS or RESEARCH_GATE: BLOCKED.',
  ].join('\n');
}

function parseArgs(argv) {
  const out = { live: false, spec: null, workdir: null, receipt: null, researchMcpCommand: null, researchMcpArgs: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--live') out.live = true;
    else if (a === '--spec') out.spec = argv[++i];
    else if (a === '--workdir') out.workdir = argv[++i];
    else if (a === '--receipt') out.receipt = argv[++i];
    else if (a === '--research-mcp-command') out.researchMcpCommand = argv[++i];
    else if (a === '--research-mcp-arg') out.researchMcpArgs.push(argv[++i]);
    else fail(`unknown argument: ${a}`);
  }
  if (!out.spec || !out.workdir) fail('--spec and --workdir are required');
  if (!out.live) fail('live model execution requires explicit --live');
  return out;
}

function assertClean(cwd) {
  const status = runSync('git', ['status', '--porcelain'], { cwd });
  if (status.exit !== 0) fail(`cannot inspect workdir git status: ${status.stderr}`);
  if (status.stdout.trim()) fail('workdir must be clean at sprint start');
}

function preflight() {
  if (process.version !== 'v24.19.0') fail(`Node v24.19.0 required; got ${process.version}`);
  const dsh = runSync('smokestack-dsh', ['--profile', 'headless', '--dump-config'], { timeoutMs: 120000 });
  if (dsh.exit !== 0) fail(`DSH headless preflight failed: ${dsh.stderr || dsh.stdout}`);
  if (dsh.stderr.trim()) fail(`DSH headless preflight emitted stderr: ${dsh.stderr.trim().slice(0, 1000)}`);
}

async function runResearch({ cwd, task, controlRoot, researchMcp }) {
  const proxy = await startOpenRouterProxy({ cap: 8, label: `${task.id}/RESEARCH` });
  try {
    const patches = writeDshPatches({
      controlDir: path.join(controlRoot, task.id, 'research'),
      port: proxy.port,
      phase: 'research',
      researchMcp,
    });
    const before = changedPaths(cwd);
    const result = await dshRun({ cwd, patches, prompt: buildResearchPrompt(task), label: `${task.id}/RESEARCH`, timeoutSeconds: 300 });
    const after = changedPaths(cwd);
    const parsed = parseResearchReceipt(`${result.stdout}\n${result.stderr}`);
    const validEvidence = parsed.evidence && Array.isArray(parsed.evidence.sources) && parsed.evidence.sources.length >= 2;
    return {
      ok: result.exit === 0 && parsed.gate === 'PASS' && validEvidence && JSON.stringify(before) === JSON.stringify(after),
      result,
      parsed,
      parent: { ...proxy.state },
      worktree_unchanged: JSON.stringify(before) === JSON.stringify(after),
    };
  } finally {
    await proxy.close();
  }
}

async function runTaskLifecycle({ cwd, task, sprint, tenStack, controlRoot, researchEvidence }) {
  const proxy = await startOpenRouterProxy({ cap: 8, label: `${task.id}/LIFECYCLE` });
  const phases = [];
  try {
    startImplementation(sprint, task.id);
    let patches = writeDshPatches({ controlDir: path.join(controlRoot, task.id, 'implement'), port: proxy.port, phase: 'implement' });
    let result = await dshRun({ cwd, patches, prompt: buildImplementPrompt(task, researchEvidence), label: `${task.id}/IMPLEMENT`, timeoutSeconds: 300 });
    const implementMarker = /(^|\n)SPRINT_IMPLEMENT_OK(\n|$)/.test(result.stdout);
    phases.push({ phase: 'IMPLEMENT', exit: result.exit, marker: implementMarker, duration_ms: result.duration_ms });
    finishImplementation(sprint, task.id, { exit_code: result.exit === 0 && implementMarker ? 0 : 1 });
    if (sprint.tasks[task.id].state === 'FAILED') return { phases, parent: { ...proxy.state }, review_text: null };

    let verify = hostVerify(cwd, task);
    phases.push({ phase: 'HOST_VERIFY', ...verify });
    finishHostVerify(sprint, task.id, { pass: verify.pass, reason: verify.reason });
    if (sprint.tasks[task.id].state === 'FAILED' || sprint.tasks[task.id].state === 'PASS') return { phases, parent: { ...proxy.state }, review_text: null };

    patches = writeDshPatches({ controlDir: path.join(controlRoot, task.id, 'review'), port: proxy.port, phase: 'review' });
    result = await dshRun({ cwd, patches, prompt: buildReviewPrompt(task, tenStack, 'hostile review'), label: `${task.id}/REVIEW`, timeoutSeconds: 300 });
    const reviewText = `${result.stdout}\n${result.stderr}`;
    const gate = result.exit === 0 ? parseReviewGate(reviewText) : 'AMBIGUOUS';
    phases.push({ phase: 'REVIEW', exit: result.exit, gate, duration_ms: result.duration_ms });
    if (gate === 'AMBIGUOUS') {
      markBlocked(sprint, task.id, 'AMBIGUOUS_OR_FAILED_REVIEW');
      return { phases, parent: { ...proxy.state }, review_text: reviewText };
    }
    finishReview(sprint, task.id, { gate });
    if (sprint.tasks[task.id].state === 'PASS') return { phases, parent: { ...proxy.state }, review_text: reviewText };

    startRepair(sprint, task.id);
    patches = writeDshPatches({ controlDir: path.join(controlRoot, task.id, 'repair'), port: proxy.port, phase: 'repair' });
    result = await dshRun({ cwd, patches, prompt: buildRepairPrompt(task, reviewText), label: `${task.id}/REPAIR`, timeoutSeconds: 300 });
    const repairMarker = /(^|\n)SPRINT_REPAIR_OK(\n|$)/.test(result.stdout);
    phases.push({ phase: 'REPAIR', exit: result.exit, marker: repairMarker, duration_ms: result.duration_ms });
    finishRepair(sprint, task.id, { exit_code: result.exit === 0 && repairMarker ? 0 : 1 });
    if (sprint.tasks[task.id].state === 'FAILED') return { phases, parent: { ...proxy.state }, review_text: reviewText };

    verify = hostVerify(cwd, task);
    phases.push({ phase: 'HOST_RETEST', ...verify });
    finishHostVerify(sprint, task.id, { pass: verify.pass, reason: verify.reason });
    if (sprint.tasks[task.id].state !== 'REREVIEWING') return { phases, parent: { ...proxy.state }, review_text: reviewText };

    patches = writeDshPatches({ controlDir: path.join(controlRoot, task.id, 'rereview'), port: proxy.port, phase: 'rereview' });
    result = await dshRun({ cwd, patches, prompt: buildReviewPrompt(task, tenStack, 'targeted rereview'), label: `${task.id}/REREVIEW`, timeoutSeconds: 300 });
    const rereviewText = `${result.stdout}\n${result.stderr}`;
    const rereviewGate = result.exit === 0 ? parseReviewGate(rereviewText) : 'AMBIGUOUS';
    phases.push({ phase: 'REREVIEW', exit: result.exit, gate: rereviewGate, duration_ms: result.duration_ms });
    if (rereviewGate === 'AMBIGUOUS') {
      markBlocked(sprint, task.id, 'AMBIGUOUS_OR_FAILED_REREVIEW');
      return { phases, parent: { ...proxy.state }, review_text: rereviewText };
    }
    finishRereview(sprint, task.id, { gate: rereviewGate });
    return { phases, parent: { ...proxy.state }, review_text: rereviewText };
  } finally {
    await proxy.close();
  }
}

export async function runLiveSprint({ spec, cwd, receiptPath, researchMcp }) {
  preflight();
  assertClean(cwd);
  const requiresResearch = spec.tasks.some((t) => t.research_required === true);
  let mcpInstall = null;
  if (requiresResearch) {
    if (!researchMcp) fail('research-required sprint needs a configured literature MCP command');
    mcpInstall = ensureMcpPluginInstalled();
  }

  const sprint = createSprint(spec);
  const rawById = new Map(spec.tasks.map((t) => [t.id, t]));
  const tenStack = fs.readFileSync(path.join(repoRoot, 'docs/TEN_STACK_V1.md'), 'utf8');
  const controlRoot = path.join('/tmp/smokestack-sprint-control', spec.sprint_id.replace(/[^A-Za-z0-9_.-]/g, '_'));
  fs.rmSync(controlRoot, { recursive: true, force: true });
  fs.mkdirSync(controlRoot, { recursive: true });

  const receipt = {
    version: 1,
    sprint_id: spec.sprint_id,
    objective: spec.objective ?? '',
    started_at: new Date().toISOString(),
    spec_sha256: crypto.createHash('sha256').update(JSON.stringify(spec)).digest('hex'),
    workdir: cwd,
    mcp_plugin: mcpInstall,
    tasks: [],
    checkpoints: [],
  };

  while (sprint.state === 'ACTIVE') {
    const frontier = readyFrontier(sprint);
    if (frontier.length === 0) break;
    const taskId = frontier[0];
    const task = rawById.get(taskId);
    console.log(`\n=== SPRINT TASK ${taskId} mode=${task.mode} ===`);
    const taskReceipt = { id: taskId, mode: task.mode, research: null, lifecycle: null, commit: null };

    let researchEvidence = null;
    if (task.research_required === true) {
      const research = await runResearch({ cwd, task, controlRoot, researchMcp });
      taskReceipt.research = {
        ok: research.ok,
        parsed: research.parsed,
        parent: research.parent,
        worktree_unchanged: research.worktree_unchanged,
        exit: research.result.exit,
        duration_ms: research.result.duration_ms,
      };
      if (!research.ok) {
        recordResearch(sprint, taskId, { ok: false, reason: 'RESEARCH_MCP_OR_EVIDENCE_GATE_FAILED' });
        receipt.tasks.push(taskReceipt);
        receipt.checkpoints.push(checkpoint(sprint));
        continue;
      }
      researchEvidence = research.parsed.evidence;
      recordResearch(sprint, taskId, { ok: true });
    }

    taskReceipt.lifecycle = await runTaskLifecycle({ cwd, task, sprint, tenStack, controlRoot, researchEvidence });
    const current = sprint.tasks[taskId];
    if (current.state === 'PASS') {
      try {
        taskReceipt.commit = commitTask(cwd, taskId, task.authority?.write ?? []);
      } catch (err) {
        fail(`host commit checkpoint failed after ${taskId}: ${err.message}`);
      }
    }

    receipt.tasks.push(taskReceipt);
    receipt.checkpoints.push(checkpoint(sprint));
    if (receiptPath) writeJson(receiptPath, { ...receipt, current: checkpoint(sprint) });
  }

  const final = checkpoint(sprint);
  const gitStatus = runSync('git', ['status', '--porcelain'], { cwd });
  receipt.finished_at = new Date().toISOString();
  receipt.final = final;
  receipt.clean_worktree = gitStatus.exit === 0 && gitStatus.stdout.trim() === '';
  if (receiptPath) writeJson(receiptPath, receipt);

  console.log('\n==========================================');
  console.log('SMOKESTACK LIVE SPRINT FINAL');
  console.log('==========================================');
  console.log(JSON.stringify({
    sprint_id: receipt.sprint_id,
    state: final.state,
    terminal_reason: final.terminal_reason,
    clean_worktree: receipt.clean_worktree,
    task_states: Object.fromEntries(Object.entries(final.tasks).map(([id, t]) => [id, t.state])),
    checkpoint_sha256: final.sha256,
    receipt: receiptPath ?? null,
  }, null, 2));
  return { sprint, receipt };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const spec = readJson(path.resolve(args.spec));
  const cwd = path.resolve(args.workdir);
  const receiptPath = path.resolve(args.receipt ?? path.join('/tmp', `${spec.sprint_id}-receipt.json`));
  const researchMcp = args.researchMcpCommand ? { command: args.researchMcpCommand, args: args.researchMcpArgs } : null;
  const { receipt } = await runLiveSprint({ spec, cwd, receiptPath, researchMcp });
  process.exit(receipt.final.state === 'PASS' && receipt.clean_worktree ? 0 : 2);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => fail(err.stack || err.message));
}
