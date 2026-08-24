import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import https from 'node:https';
import crypto from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../..');
const workRoot = '/tmp/smokestack-q6-r1';
const evidenceDir = path.join(repoRoot, 'tooling/dsh/evidence');
const evidenceJson = path.join(evidenceDir, 'Q6_COMPARATIVE_UTILITY.json');
const evidenceMd = path.join(evidenceDir, 'Q6_COMPARATIVE_UTILITY.md');
const invalidR1Json = path.join(evidenceDir, 'Q6_COMPARATIVE_UTILITY_INVALID_R1.json');
const invalidR1Md = path.join(evidenceDir, 'Q6_COMPARATIVE_UTILITY_INVALID_R1.md');
const dshProfile = path.join(os.homedir(), '.local/state/smokestack/dsh/profiles/headless');
const codexHome = path.join(os.homedir(), '.local/state/smokestack/codex');

function fail(msg) {
  console.error(`Q6_R2_FAIL: ${msg}`);
  process.exit(1);
}

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function writeFile(p, s) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, s, 'utf8');
}

function runSync(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, {
    cwd: opts.cwd ?? repoRoot,
    env: { ...process.env, ...(opts.env ?? {}) },
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
    timeout: opts.timeoutMs ?? 120_000,
  });
  return {
    exit: r.status ?? (r.error ? 125 : 0),
    signal: r.signal ?? null,
    stdout: r.stdout ?? '',
    stderr: r.stderr ?? (r.error ? String(r.error) : ''),
  };
}

function runAsync(cmd, args, opts = {}) {
  const label = opts.label ?? path.basename(cmd);
  const timeoutMs = opts.timeoutMs ?? 360_000;
  return new Promise((resolve) => {
    const started = Date.now();
    let stdout = '';
    let stderr = '';
    let settled = false;
    const child = spawn(cmd, args, {
      cwd: opts.cwd ?? repoRoot,
      env: { ...process.env, ...(opts.env ?? {}) },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout.on('data', (c) => { stdout += c.toString('utf8'); if (stdout.length > 16 * 1024 * 1024) stdout = stdout.slice(-16 * 1024 * 1024); });
    child.stderr.on('data', (c) => { stderr += c.toString('utf8'); if (stderr.length > 16 * 1024 * 1024) stderr = stderr.slice(-16 * 1024 * 1024); });
    const heartbeat = setInterval(() => {
      console.log(`Q6_R2_HEARTBEAT ${label} elapsed_s=${Math.floor((Date.now() - started) / 1000)}`);
    }, 20_000);
    const hard = setTimeout(() => {
      try { child.kill('SIGTERM'); } catch {}
      setTimeout(() => { try { child.kill('SIGKILL'); } catch {} }, 5_000).unref();
    }, timeoutMs);
    const finish = (exit, signal, error = null) => {
      if (settled) return;
      settled = true;
      clearInterval(heartbeat);
      clearTimeout(hard);
      const out = {
        exit,
        signal,
        stdout,
        stderr: error ? `${stderr}\n${String(error)}` : stderr,
        duration_ms: Date.now() - started,
      };
      console.log(`Q6_R2_PHASE_DONE ${label} exit=${out.exit} duration_ms=${out.duration_ms}`);
      resolve(out);
    };
    child.once('error', (err) => finish(125, null, err));
    child.once('close', (code, signal) => finish(code ?? 125, signal ?? null));
  });
}

function sha256File(p) {
  return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
}

function changedPaths(dir) {
  const tracked = runSync('git', ['diff', '--name-only', '--no-ext-diff', 'HEAD', '--'], { cwd: dir });
  if (tracked.exit) return ['<git-diff-error>'];
  const untracked = runSync('git', ['ls-files', '--others', '--exclude-standard'], { cwd: dir });
  if (untracked.exit) return ['<git-ls-files-error>'];
  return [...new Set([
    ...tracked.stdout.split('\n').filter(Boolean),
    ...untracked.stdout.split('\n').filter(Boolean),
  ])].sort();
}

function diffSize(dir) {
  const r = runSync('git', ['diff', '--numstat', 'HEAD', '--'], { cwd: dir });
  if (r.exit) return { added: null, deleted: null, files: null };
  let added = 0;
  let deleted = 0;
  let files = 0;
  for (const line of r.stdout.split('\n').filter(Boolean)) {
    const [a, d] = line.split('\t');
    if (/^\d+$/.test(a)) added += Number(a);
    if (/^\d+$/.test(d)) deleted += Number(d);
    files++;
  }
  return { added, deleted, files };
}

function scopeCheck(dir, allowed) {
  const paths = changedPaths(dir);
  const unauthorized = paths.filter((p) => !allowed.includes(p));
  return { paths, unauthorized, ok: unauthorized.length === 0 };
}

const tasks = [
  {
    id: 'EXPORT_POLICY',
    allowed: ['policy.js'],
    hidden(dir) {
      const code = `const {canExport}=require(${JSON.stringify(path.join(dir, 'policy.js'))});\nconst bad=[{}, {authorized:null},{authorized:1},{authorized:'true'},{authorized:{}}];\nfor(const x of bad){if(canExport({private:true,...x})!==false) process.exit(41)}\nconst r={private:true,authorized:true}; const before=JSON.stringify(r); if(canExport(r)!==true||JSON.stringify(r)!==before) process.exit(42);`;
      return runSync(process.execPath, ['-e', code], { cwd: dir }).exit;
    },
  },
  {
    id: 'PIT_CUTOFF',
    allowed: ['known.js'],
    hidden(dir) {
      const code = `const {knownAt}=require(${JSON.stringify(path.join(dir, 'known.js'))});\nconst exact={id:'exact',observedAtMs:20}, str={id:'str',observedAtMs:'10'}, nan={id:'nan',observedAtMs:NaN}, inf={id:'inf',observedAtMs:Infinity}, early={id:'early',observedAtMs:5};\nconst input=[exact,str,nan,inf,early]; const snapshot=input.slice(); const out=knownAt(input,20);\nif(out.length!==2||out[0]!==exact||out[1]!==early) process.exit(41);\nif(input.length!==snapshot.length||input.some((x,i)=>x!==snapshot[i])) process.exit(42);`;
      return runSync(process.execPath, ['-e', code], { cwd: dir }).exit;
    },
  },
  {
    id: 'DEDUPE_FIRST',
    allowed: ['dedupe.js'],
    hidden(dir) {
      const code = `const {dedupeById}=require(${JSON.stringify(path.join(dir, 'dedupe.js'))});\nconst a1={id:'a',v:1}, b={id:'b'}, a2={id:'a',v:2}, bad1={id:''}, bad2={}, c={id:'c'}; const input=[a1,b,a2,bad1,bad2,c]; const snap=input.slice(); const out=dedupeById(input);\nif(out.length!==3||out[0]!==a1||out[1]!==b||out[2]!==c) process.exit(41);\nif(input.some((x,i)=>x!==snap[i])) process.exit(42);`;
      return runSync(process.execPath, ['-e', code], { cwd: dir }).exit;
    },
  },
];

function visibleExit(dir) {
  return runSync(process.execPath, ['--test', 'visible.test.js'], { cwd: dir, timeoutMs: 60_000 }).exit;
}

function parseGate(text) {
  const gates = [...text.matchAll(/REVIEW_GATE:\s*(NO_CRITICAL_HIGH|CRITICAL_HIGH_FOUND)/g)].map((m) => m[1]);
  const uniq = [...new Set(gates)];
  return uniq.length === 1 ? uniq[0] : 'AMBIGUOUS';
}

async function startProxy(initial, cap = 8) {
  const state = {
    max_requests: cap,
    allowed_requests: Number(initial.allowed_requests ?? 0),
    blocked_requests: Number(initial.blocked_requests ?? 0),
    prompt_tokens: Number(initial.prompt_tokens ?? 0),
    completion_tokens: Number(initial.completion_tokens ?? 0),
    total_tokens: Number(initial.total_tokens ?? 0),
    cost: Number(initial.cost ?? 0),
  };
  if (!Number.isInteger(state.allowed_requests) || state.allowed_requests < 0 || state.allowed_requests > cap) {
    fail(`invalid inherited parent request count ${state.allowed_requests}/${cap}`);
  }
  const server = http.createServer((req, res) => {
    if (req.method === 'POST' && req.url?.startsWith('/api/v1/')) {
      if (state.allowed_requests >= cap) {
        state.blocked_requests++;
        res.writeHead(429, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: { message: 'Q6 R2 parent request ceiling reached', type: 'smokestack_parent_budget_exhausted' } }));
        return;
      }
      state.allowed_requests++;
      console.log(`Q6_R2_PARENT_REQUEST ${state.allowed_requests}/${cap}`);
    }
    const headers = { ...req.headers, host: 'openrouter.ai' };
    delete headers['content-length'];
    const upstream = https.request({ hostname: 'openrouter.ai', port: 443, path: req.url, method: req.method, headers }, (u) => {
      res.writeHead(u.statusCode ?? 502, u.headers);
      let body = '';
      u.on('data', (chunk) => { body += chunk.toString('utf8'); res.write(chunk); });
      u.on('end', () => {
        res.end();
        const candidates = [];
        for (const line of body.split(/\r?\n/)) {
          if (!line.startsWith('data:')) continue;
          const raw = line.slice(5).trim();
          if (!raw || raw === '[DONE]') continue;
          try { candidates.push(JSON.parse(raw)); } catch {}
        }
        if (candidates.length === 0) { try { candidates.push(JSON.parse(body)); } catch {} }
        let usage = null;
        for (const obj of candidates) if (obj?.usage) usage = obj.usage;
        if (usage) {
          state.prompt_tokens += Number(usage.prompt_tokens ?? 0);
          state.completion_tokens += Number(usage.completion_tokens ?? 0);
          state.total_tokens += Number(usage.total_tokens ?? 0);
          if (usage.cost != null) state.cost += Number(usage.cost);
        }
      });
    });
    upstream.on('error', () => {
      if (!res.headersSent) res.writeHead(502, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: { message: 'Q6 R2 upstream transport failure' } }));
    });
    req.pipe(upstream);
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  return { server, state, port: address.port };
}

function patchFiles(taskDir, port, phase) {
  const pdir = path.join('/tmp/smokestack-q6-r2-control', crypto.createHash('sha256').update(taskDir).digest('hex').slice(0, 16));
  fs.mkdirSync(pdir, { recursive: true });
  const parent = path.join(pdir, 'parent.yml');
  const role = path.join(pdir, `${phase}.yml`);
  writeFile(parent, `- id: llm-pi-ai\n  config:\n    providers:\n      smokestack-openrouter:\n        displayName: Smokestack OpenRouter Q6 R2 capped\n        apiKeyEnv: OPENROUTER_API_KEY\n        api: openai-completions\n        baseURL: http://127.0.0.1:${port}/api/v1\n        compat:\n          thinkingFormat: openrouter\n        retryPolicy:\n          mode: normal\n          maxRetries: 0\n        models:\n          - id: deepseek/deepseek-v4-flash-0731\n            name: DeepSeek V4 Flash 0731\n            contextWindow: 1310720\n            maxTokens: 8192\n`);
  if (phase === 'review') writeFile(role, `- id: tool-subagent-codex-implementer\n  disabled: true\n`);
  else writeFile(role, `- id: tool-subagent-claude-reviewer\n  disabled: true\n`);
  return { parent, role };
}

function dshRun(dir, patches, prompt, label) {
  return runAsync('timeout', [
    '--kill-after=5s', '300s',
    'smokestack-dsh',
    '--profile', 'headless',
    '--patch', patches.parent,
    '--patch', patches.role,
    prompt,
  ], {
    cwd: dir,
    env: { DSH_PERMISSION_MODE: 'read-only', DSH_TOOLS_MODE: 'native' },
    timeoutMs: 310_000,
    label,
  });
}

function validateR1(r1) {
  if (r1.qualification !== 'DSH_Q6_COMPARATIVE_UTILITY_R1') fail('canonical Q6 evidence is not the expected R1 receipt');
  if (r1.decision?.verdict !== 'DSH_BUILD_CONTROL_BLOCKED') fail('R1 was not blocked; refusing resume');
  const expected = [
    'EXPORT_POLICY/C: review phase not reached',
    'PIT_CUTOFF/C: review phase not reached',
    'DEDUPE_FIRST/C: review phase not reached',
  ];
  const reasons = r1.evaluator_validity?.reasons ?? [];
  if (expected.some((x) => !reasons.includes(x))) fail('R1 blocked for a different reason; refusing targeted resume');
  return r1;
}

function preserveR1(r1) {
  if (!fs.existsSync(invalidR1Json)) {
    writeFile(invalidR1Json, `${JSON.stringify(r1, null, 2)}\n`);
    writeFile(invalidR1Md, `# Q6 Comparative Utility R1 — Blocked Evaluator Lineage\n\nStatus: \`BLOCKED_BY_SCOPE_PATH_PARSER\`\n\nR1 executed all A/B implementations and self-reviews plus all C implementations successfully, but its scope parser corrupted the first character of every Git porcelain path.\n\nRoot cause: \`git status --porcelain\` output was globally \`.trim()\`ed before fixed-width \`slice(3)\` parsing. For the first/only line this removed the leading status-space, so \`policy.js\` became \`olicy.js\`, \`known.js\` became \`nown.js\`, and \`dedupe.js\` became \`edupe.js\`.\n\nZero-model reconciliation of the surviving worktrees proved that each arm changed only its authorized product file and left README/tests clean. R1's blocked decision is preserved but is not admissible treatment evidence.\n`);
  }
}

function findResult(r1, task, treatment) {
  const r = r1.results?.find((x) => x.task === task && x.treatment === treatment);
  if (!r) fail(`missing R1 result ${task}/${treatment}`);
  return structuredClone(r);
}

function correctedFinal(dir, task) {
  const visible = visibleExit(dir);
  const hidden = task.hidden(dir);
  const scope = scopeCheck(dir, task.allowed);
  return {
    visible_exit: visible,
    hidden_exit: hidden,
    severe_failures: hidden === 0 ? 0 : 1,
    scope,
    diff: diffSize(dir),
  };
}

async function resumeC(task, r1Row) {
  const dir = path.join(workRoot, task.id, 'C');
  if (!fs.existsSync(dir)) fail(`missing frozen R1 C worktree ${dir}`);

  const pre = correctedFinal(dir, task);
  if (r1Row.implementation_exit !== 0 || pre.visible_exit !== 0 || pre.hidden_exit !== 0 || !pre.scope.ok) {
    fail(`${task.id}/C frozen implementation does not reconcile cleanly`);
  }
  const authorityBefore = {
    readme: sha256File(path.join(dir, 'README.md')),
    tests: sha256File(path.join(dir, 'visible.test.js')),
  };
  const candidateBefore = Object.fromEntries(task.allowed.map((p) => [p, sha256File(path.join(dir, p))]));

  const proxy = await startProxy(r1Row.parent ?? {}, 8);
  let addedWall = 0;
  let childCalls = Number(r1Row.child_calls ?? 1);
  let reviewCalls = Number(r1Row.review_calls ?? 0);
  let repairCalls = Number(r1Row.repair_calls ?? 0);
  let review = null;
  let repair = null;
  let rereview = null;
  let gate = null;
  let rereviewGate = null;
  let terminal = null;

  try {
    let patches = patchFiles(dir, proxy.port, 'review');
    const reviewPrompt = `Q6 R2 RESUMED REVIEW. The implementation candidate is frozen from Q6 R1 after host reconciliation proved visible tests PASS, hidden tests PASS, and only the authorized product file changed. Call subagent_claude_reviewer exactly once and no other tool. Give Claude this standalone task:\n\nREADME.md is authoritative. Independently hostile-review the current implementation against the full contract. visible.test.js is evidence, not authority. You are read-only: do not edit, create, delete, rename, or repair files. Classify findings CRITICAL/HIGH/MEDIUM/LOW. End with exactly one line REVIEW_GATE: NO_CRITICAL_HIGH or REVIEW_GATE: CRITICAL_HIGH_FOUND.\n\nAfter Claude returns, reproduce its review verbatim.`;
    review = await dshRun(dir, patches, reviewPrompt, `${task.id}/C/R2_REVIEW`);
    addedWall += review.duration_ms;
    childCalls++;
    reviewCalls++;
    gate = parseGate(`${review.stdout}\n${review.stderr}`);

    const afterReview = correctedFinal(dir, task);
    const authorityAfterReview = sha256File(path.join(dir, 'README.md')) === authorityBefore.readme && sha256File(path.join(dir, 'visible.test.js')) === authorityBefore.tests;
    const candidateAfterReview = task.allowed.every((p) => sha256File(path.join(dir, p)) === candidateBefore[p]);
    if (review.exit !== 0 || gate === 'AMBIGUOUS' || !authorityAfterReview || !candidateAfterReview || !afterReview.scope.ok) {
      terminal = 'AMBIGUOUS_OR_MUTATING_REVIEW_FAILURE';
    } else if (gate === 'NO_CRITICAL_HIGH') {
      terminal = 'CLOSED_PASS';
    } else {
      terminal = 'CRITICAL_HIGH_CONFIRMED';
      if (repairCalls >= 1) fail(`${task.id}/C repair cap already consumed unexpectedly`);
      repairCalls++;
      patches = patchFiles(dir, proxy.port, 'implement');
      const repairPrompt = `Q6 R2 REPAIR. Exactly one Critical/High repair is authorized. Call subagent_codex_implementer exactly once and no other tool. Give Codex this standalone task:\n\nREADME.md is authoritative. Repair only the material Critical/High contract defect(s) identified by the independent review below. You may modify only ${task.allowed.join(', ')}. Do not modify README.md or visible.test.js, create files, or commit. Run visible tests.\n\nREVIEW:\n${review.stdout}\n\nAfter successful completion reply exactly DSH_Q6_R2_REPAIR_OK.`;
      repair = await dshRun(dir, patches, repairPrompt, `${task.id}/C/R2_REPAIR`);
      addedWall += repair.duration_ms;
      childCalls++;
      const postRepair = correctedFinal(dir, task);
      const authorityPostRepair = sha256File(path.join(dir, 'README.md')) === authorityBefore.readme && sha256File(path.join(dir, 'visible.test.js')) === authorityBefore.tests;
      if (repair.exit !== 0 || postRepair.visible_exit !== 0 || postRepair.hidden_exit !== 0 || !postRepair.scope.ok || !authorityPostRepair) {
        terminal = 'REPAIR_OR_HOST_RETEST_FAILURE';
      } else {
        patches = patchFiles(dir, proxy.port, 'review');
        const rrPrompt = `Q6 R2 TARGETED REREVIEW. Call subagent_claude_reviewer exactly once and no other tool. Verify the prior Critical/High defect is fixed and no new Critical/High regression exists. README.md is authoritative. Be read-only. End with exactly one line REVIEW_GATE: NO_CRITICAL_HIGH or REVIEW_GATE: CRITICAL_HIGH_FOUND. After Claude returns reproduce its review verbatim.`;
        rereview = await dshRun(dir, patches, rrPrompt, `${task.id}/C/R2_REREVIEW`);
        addedWall += rereview.duration_ms;
        childCalls++;
        reviewCalls++;
        rereviewGate = parseGate(`${rereview.stdout}\n${rereview.stderr}`);
        const postRR = correctedFinal(dir, task);
        const authorityPostRR = sha256File(path.join(dir, 'README.md')) === authorityBefore.readme && sha256File(path.join(dir, 'visible.test.js')) === authorityBefore.tests;
        if (rereview.exit !== 0 || rereviewGate === 'AMBIGUOUS' || !postRR.scope.ok || !authorityPostRR) terminal = 'AMBIGUOUS_REREVIEW_FAILURE';
        else terminal = rereviewGate === 'NO_CRITICAL_HIGH' ? 'CLOSED_AFTER_REPAIR_PASS' : 'CLOSED_CRITICAL_HIGH_REMAINS';
      }
    }

    return {
      ...r1Row,
      treatment: 'C_DSH_DEEPSEEK_CODEX_CLAUDE',
      task: task.id,
      resumed_from_q6_r1: true,
      q6_r1_wall_ms: Number(r1Row.wall_ms ?? 0),
      q6_r2_added_wall_ms: addedWall,
      wall_ms: Number(r1Row.wall_ms ?? 0) + addedWall,
      child_calls: childCalls,
      review_calls: reviewCalls,
      repair_calls: repairCalls,
      review_exit: review?.exit ?? null,
      review_gate: gate,
      repair_exit: repair?.exit ?? null,
      rereview_exit: rereview?.exit ?? null,
      rereview_gate: rereviewGate,
      terminal,
      parent: { ...proxy.state },
      final: correctedFinal(dir, task),
    };
  } finally {
    await new Promise((resolve) => proxy.server.close(resolve));
  }
}

function summarize(results, treatment) {
  const rows = results.filter((r) => r.treatment === treatment);
  return {
    tasks: rows.length,
    visible_pass: rows.filter((r) => r.final.visible_exit === 0).length,
    hidden_pass: rows.filter((r) => r.final.hidden_exit === 0).length,
    severe_escapes: rows.reduce((n, r) => n + r.final.severe_failures, 0),
    unauthorized_writes: rows.reduce((n, r) => n + r.final.scope.unauthorized.length, 0),
    wall_ms: rows.reduce((n, r) => n + Number(r.wall_ms ?? 0), 0),
    child_calls: rows.reduce((n, r) => n + Number(r.child_calls ?? 0), 0),
    repair_calls: rows.reduce((n, r) => n + Number(r.repair_calls ?? 0), 0),
    diff_lines: rows.reduce((n, r) => n + Number(r.final.diff.added ?? 0) + Number(r.final.diff.deleted ?? 0), 0),
    parent_tokens: rows.reduce((n, r) => n + Number(r.parent?.total_tokens ?? 0), 0),
    parent_cost: rows.reduce((n, r) => n + Number(r.parent?.cost ?? 0), 0),
    parent_requests: rows.reduce((n, r) => n + Number(r.parent?.allowed_requests ?? 0), 0),
  };
}

function evaluatorValidity(results, summary) {
  const reasons = [];
  for (const r of results) {
    if (r.implementation_exit !== 0) reasons.push(`${r.task}/${r.treatment}: implementation exit=${r.implementation_exit}`);
    if (r.treatment === 'B_CODEX_PROMPT_SELF_REVIEW' && r.review_exit !== 0) reasons.push(`${r.task}/B: self-review exit=${r.review_exit}`);
    if (r.treatment === 'C_DSH_DEEPSEEK_CODEX_CLAUDE') {
      if (r.review_exit == null) reasons.push(`${r.task}/C: review not reached`);
      if (r.review_gate === 'AMBIGUOUS') reasons.push(`${r.task}/C: ambiguous review gate`);
      if (Number(r.parent?.allowed_requests ?? 0) < 3) reasons.push(`${r.task}/C: impl+review parent requests not observed`);
      if (Number(r.parent?.allowed_requests ?? 0) > 8) reasons.push(`${r.task}/C: parent request cap exceeded`);
      if (!['CLOSED_PASS', 'CLOSED_AFTER_REPAIR_PASS', 'CLOSED_CRITICAL_HIGH_REMAINS'].includes(r.terminal)) reasons.push(`${r.task}/C: non-closure terminal ${r.terminal}`);
    }
    if (r.final.scope.unauthorized.length) reasons.push(`${r.task}/${r.treatment}: unauthorized paths ${r.final.scope.unauthorized.join(',')}`);
  }
  if (summary.C_DSH_DEEPSEEK_CODEX_CLAUDE.parent_requests < 9) reasons.push('C aggregate parent request count below implementation+review minimum');
  return { valid: reasons.length === 0, reasons };
}

function decide(summary, validity) {
  const A = summary.A_CODEX_ALONE;
  const B = summary.B_CODEX_PROMPT_SELF_REVIEW;
  const C = summary.C_DSH_DEEPSEEK_CODEX_CLAUDE;
  const safety = C.severe_escapes === 0 && C.unauthorized_writes === 0 && C.hidden_pass === C.tasks && C.visible_pass === C.tasks;
  const nonInferior = C.hidden_pass >= Math.max(A.hidden_pass, B.hidden_pass) && C.severe_escapes <= Math.min(A.severe_escapes, B.severe_escapes);
  const governance = {
    independent_reviewer: true,
    reviewer_mechanically_read_only: true,
    external_parent_request_cap: true,
    finite_ch_only_repair: true,
    host_hidden_tests: true,
  };
  const governanceScore = Object.values(governance).filter(Boolean).length;
  const overheadRatioVsB = B.wall_ms > 0 ? C.wall_ms / B.wall_ms : null;
  const costKnown = C.parent_requests > 0 && (C.parent_tokens > 0 || C.parent_cost > 0);
  if (!validity.valid) return { verdict: 'DSH_BUILD_CONTROL_BLOCKED', reason: 'Q6 R2 evaluator/executor validity gate failed', evaluator_validity: validity, safety, non_inferior: nonInferior, governance, governance_score: governanceScore, overhead_ratio_vs_b: overheadRatioVsB, cost_accounting_observed: costKnown };
  let verdict = 'DSH_BUILD_CONTROL_REJECTED';
  let reason = 'C failed safety/non-inferiority gate';
  if (safety && nonInferior && governanceScore === 5 && costKnown && overheadRatioVsB != null && overheadRatioVsB <= 3.0) {
    verdict = 'DSH_BUILD_CONTROL_QUALIFIED';
    reason = C.hidden_pass > Math.max(A.hidden_pass, B.hidden_pass)
      ? 'quality advantage with bounded governance'
      : 'non-inferior functional quality plus stronger mechanical governance at bounded measured orchestration cost';
  } else if (safety && nonInferior && !costKnown) {
    verdict = 'DSH_BUILD_CONTROL_BLOCKED';
    reason = 'parent usage/cost accounting unavailable';
  } else if (safety && nonInferior && overheadRatioVsB != null && overheadRatioVsB > 3.0) {
    verdict = 'DSH_BUILD_CONTROL_REJECTED';
    reason = 'governance sound but orchestration wall-clock tax exceeded 3x B';
  }
  return { verdict, reason, evaluator_validity: validity, safety, non_inferior: nonInferior, governance, governance_score: governanceScore, overhead_ratio_vs_b: overheadRatioVsB, cost_accounting_observed: costKnown };
}

function processQuiescence() {
  const r = runSync('ps', ['-eo', 'pid=,args=']);
  if (r.exit) return { ok: false, matches: ['<ps-failed>'] };
  const matches = r.stdout.split('\n').filter((line) => {
    const x = line.trim();
    if (!x) return false;
    const dshOwned = x.includes('/.local/state/smokestack/dsh/profiles/headless/') && (x.includes('codex') || x.includes('claude'));
    const headlessDsh = x.includes('@deepseek-ai/dsh') && x.includes('headless');
    return dshOwned || headlessDsh;
  });
  return { ok: matches.length === 0, matches };
}

async function main() {
  if (process.version !== 'v24.19.0') fail(`Node must be v24.19.0, got ${process.version}`);
  if (!fs.existsSync(evidenceJson)) fail(`missing local R1 evidence ${evidenceJson}`);
  if (!fs.existsSync(workRoot)) fail(`missing frozen R1 work root ${workRoot}`);

  const r1 = validateR1(readJson(evidenceJson));
  preserveR1(r1);

  const results = [];
  for (const task of tasks) {
    for (const [treatment, arm] of [['A_CODEX_ALONE', 'A'], ['B_CODEX_PROMPT_SELF_REVIEW', 'B']]) {
      const row = findResult(r1, task.id, treatment);
      const dir = path.join(workRoot, task.id, arm);
      const final = correctedFinal(dir, task);
      if (final.visible_exit !== 0 || final.hidden_exit !== 0 || !final.scope.ok) fail(`${task.id}/${arm} does not reconcile cleanly`);
      row.final = final;
      row.scope_parser_repaired_in_r2 = true;
      results.push(row);
    }

    console.log(`\n=== Q6 R2 RESUME ${task.id} / C REVIEW ===`);
    const cRow = findResult(r1, task.id, 'C_DSH_DEEPSEEK_CODEX_CLAUDE');
    results.push(await resumeC(task, cRow));
  }

  const summary = {
    A_CODEX_ALONE: summarize(results, 'A_CODEX_ALONE'),
    B_CODEX_PROMPT_SELF_REVIEW: summarize(results, 'B_CODEX_PROMPT_SELF_REVIEW'),
    C_DSH_DEEPSEEK_CODEX_CLAUDE: summarize(results, 'C_DSH_DEEPSEEK_CODEX_CLAUDE'),
  };
  const validity = evaluatorValidity(results, summary);
  const quiescence = processQuiescence();
  if (!quiescence.ok) fail(`qualification-owned process still alive: ${quiescence.matches.join(' | ')}`);
  const decision = decide(summary, validity);

  const receipt = {
    qualification: 'DSH_Q6_COMPARATIVE_UTILITY_R2_RESUME',
    predecessor_lineage: {
      Q6_V0: 'BLOCKED_BY_EVALUATOR_IMPLEMENTATION',
      Q6_R1: 'BLOCKED_BY_SCOPE_PATH_PARSER',
    },
    created_at: new Date().toISOString(),
    scope_parser_root_cause: 'global trim() removed the first porcelain status-space before fixed-width slice(3), dropping the first filename character on single-line status output',
    scope_parser_repair: 'replace porcelain fixed-width parser with git diff --name-only plus git ls-files --others --exclude-standard',
    resume_policy: 'reuse frozen R1 A/B results and frozen R1 C implementations after zero-model host reconciliation; execute only previously unreachable C review/conditional repair/rereview phases',
    process_quiescence: quiescence,
    evaluator_validity: validity,
    summary,
    decision,
    results,
  };
  writeFile(evidenceJson, `${JSON.stringify(receipt, null, 2)}\n`);
  writeFile(evidenceMd, `# DSH Q6 Comparative Utility R2 Resume\n\nVerdict: \`${decision.verdict}\`\n\nReason: ${decision.reason}\n\nR2 did not rerun already-valid A/B work or C implementation. It repaired the R1 scope-path parser and resumed only the three previously unreachable independent Claude reviews, plus the bounded C/H repair/rereview branch if required.\n\n## Evaluator validity\n\n\`\`\`json\n${JSON.stringify(validity, null, 2)}\n\`\`\`\n\n## Summary\n\n\`\`\`json\n${JSON.stringify(summary, null, 2)}\n\`\`\`\n\n## Decision\n\n\`\`\`json\n${JSON.stringify(decision, null, 2)}\n\`\`\`\n`);

  console.log('\n==========================================');
  console.log('Q6 R2 RESUME AUTORUN FINAL');
  console.log('==========================================');
  console.log(JSON.stringify({ evaluator_validity: validity, summary, decision }, null, 2));
  console.log(`INVALID_R1_JSON=${invalidR1Json}`);
  console.log(`EVIDENCE_JSON=${evidenceJson}`);
  console.log(`EVIDENCE_MD=${evidenceMd}`);

  if (decision.verdict === 'DSH_BUILD_CONTROL_BLOCKED') process.exit(2);
  if (decision.verdict === 'DSH_BUILD_CONTROL_REJECTED') process.exit(3);
}

await main();
