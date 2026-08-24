import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import https from 'node:https';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const toolGuardSource = path.join(here, 'dsh-tool-call-guard.mjs');

export function runSync(cmd, args, opts = {}) {
  const started = Date.now();
  const r = spawnSync(cmd, args, {
    cwd: opts.cwd,
    env: { ...process.env, ...(opts.env ?? {}) },
    encoding: 'utf8',
    maxBuffer: opts.maxBuffer ?? 16 * 1024 * 1024,
    timeout: opts.timeoutMs ?? 120_000,
    stdio: opts.stdio,
  });
  return {
    cmd,
    args,
    exit: r.status ?? (r.error ? 125 : 0),
    signal: r.signal ?? null,
    stdout: typeof r.stdout === 'string' ? r.stdout : '',
    stderr: typeof r.stderr === 'string' ? r.stderr : (r.error ? String(r.error) : ''),
    duration_ms: Date.now() - started,
  };
}

export function runAsync(cmd, args, opts = {}) {
  const label = opts.label ?? path.basename(cmd);
  const timeoutMs = opts.timeoutMs ?? 360_000;
  const trustedChannel = opts.trustedChannel === true;
  return new Promise((resolve) => {
    const started = Date.now();
    let stdout = '';
    let stderr = '';
    let trustedTranscript = '';
    let trustedTranscriptBytes = 0;
    let trustedTranscriptOverflow = false;
    let trustedChannelClosed = !trustedChannel;
    let trustedChannelError = null;
    let settled = false;
    const max = opts.maxBuffer ?? 16 * 1024 * 1024;
    const trustedMax = opts.trustedMaxBuffer ?? 4 * 1024 * 1024;
    const child = spawn(cmd, args, {
      cwd: opts.cwd,
      env: { ...process.env, ...(opts.env ?? {}) },
      stdio: ['ignore', 'pipe', 'pipe', trustedChannel ? 'pipe' : 'ignore'],
    });
    const append = (current, chunk) => {
      const next = current + chunk.toString('utf8');
      return next.length <= max ? next : next.slice(-max);
    };
    child.stdout.on('data', (c) => {
      stdout = append(stdout, c);
      if (opts.echo === true) process.stdout.write(c);
    });
    child.stderr.on('data', (c) => {
      stderr = append(stderr, c);
      if (opts.echo === true) process.stderr.write(c);
    });
    if (trustedChannel) {
      const stream = child.stdio[3];
      if (!stream) {
        trustedChannelClosed = true;
        trustedChannelError = 'trusted tool channel was not created';
      } else {
        stream.on('data', (chunk) => {
          const text = chunk.toString('utf8');
          const bytes = Buffer.from(text, 'utf8');
          const previousBytes = trustedTranscriptBytes;
          trustedTranscriptBytes += bytes.length;
          if (previousBytes < trustedMax) {
            trustedTranscript += bytes.subarray(0, trustedMax - previousBytes).toString('utf8');
          }
          if (trustedTranscriptBytes > trustedMax) trustedTranscriptOverflow = true;
        });
        const closeTrustedChannel = () => { trustedChannelClosed = true; };
        stream.once('end', closeTrustedChannel);
        stream.once('close', closeTrustedChannel);
        stream.once('error', (err) => {
          trustedChannelError = String(err);
          closeTrustedChannel();
        });
      }
    }
    const heartbeat = setInterval(() => {
      console.log(`SPRINT_HEARTBEAT ${label} elapsed_s=${Math.floor((Date.now() - started) / 1000)}`);
    }, opts.heartbeatMs ?? 20_000);
    const hard = setTimeout(() => {
      try { child.kill('SIGTERM'); } catch {}
      setTimeout(() => {
        try { child.kill('SIGKILL'); } catch {}
      }, 5_000).unref();
    }, timeoutMs);
    const finish = (exit, signal, error = null) => {
      if (settled) return;
      settled = true;
      clearInterval(heartbeat);
      clearTimeout(hard);
      const out = {
        cmd,
        args,
        exit,
        signal,
        stdout,
        stderr: error ? `${stderr}\n${String(error)}` : stderr,
        duration_ms: Date.now() - started,
        trusted_transcript: trustedTranscript,
        trusted_transcript_bytes: trustedTranscriptBytes,
        trusted_transcript_complete: !trustedChannel
          || (trustedChannelClosed && !trustedTranscriptOverflow && trustedChannelError === null),
        trusted_transcript_error: trustedChannelError,
      };
      console.log(`SPRINT_PHASE_DONE ${label} exit=${out.exit} duration_ms=${out.duration_ms}`);
      resolve(out);
    };
    child.once('error', (err) => finish(125, null, err));
    child.once('close', (code, signal) => finish(code ?? 125, signal ?? null));
  });
}

function collectUsage(body) {
  const candidates = [];
  for (const line of body.split(/\r?\n/)) {
    if (!line.startsWith('data:')) continue;
    const raw = line.slice(5).trim();
    if (!raw || raw === '[DONE]') continue;
    try { candidates.push(JSON.parse(raw)); } catch {}
  }
  if (candidates.length === 0) {
    try { candidates.push(JSON.parse(body)); } catch {}
  }
  let usage = null;
  for (const obj of candidates) {
    if (obj?.usage) usage = obj.usage;
  }
  return usage;
}

export async function startOpenRouterProxy({ cap = 8, initial = {}, label = 'SPRINT' } = {}) {
  const state = {
    max_requests: cap,
    allowed_requests: Number(initial.allowed_requests ?? 0),
    blocked_requests: Number(initial.blocked_requests ?? 0),
    prompt_tokens: Number(initial.prompt_tokens ?? 0),
    completion_tokens: Number(initial.completion_tokens ?? 0),
    total_tokens: Number(initial.total_tokens ?? 0),
    cost: Number(initial.cost ?? 0),
  };
  if (!Number.isInteger(cap) || cap < 1) throw new Error('positive integer request cap required');
  if (!Number.isInteger(state.allowed_requests) || state.allowed_requests < 0 || state.allowed_requests > cap) {
    throw new Error(`invalid inherited parent request count ${state.allowed_requests}/${cap}`);
  }

  const server = http.createServer((req, res) => {
    if (req.method === 'POST' && req.url?.startsWith('/api/v1/')) {
      if (state.allowed_requests >= cap) {
        state.blocked_requests += 1;
        res.writeHead(429, { 'content-type': 'application/json' });
        res.end(JSON.stringify({
          error: {
            message: 'Smokestack sprint parent request ceiling reached',
            type: 'smokestack_parent_budget_exhausted',
          },
        }));
        return;
      }
      state.allowed_requests += 1;
      console.log(`SPRINT_PARENT_REQUEST ${label} ${state.allowed_requests}/${cap}`);
    }

    const headers = { ...req.headers, host: 'openrouter.ai' };
    delete headers['content-length'];
    const upstream = https.request({
      hostname: 'openrouter.ai',
      port: 443,
      path: req.url,
      method: req.method,
      headers,
    }, (u) => {
      res.writeHead(u.statusCode ?? 502, u.headers);
      let body = '';
      u.on('data', (chunk) => {
        body += chunk.toString('utf8');
        res.write(chunk);
      });
      u.on('end', () => {
        res.end();
        const usage = collectUsage(body);
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
      res.end(JSON.stringify({ error: { message: 'Smokestack sprint upstream transport failure' } }));
    });
    req.pipe(upstream);
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  return {
    server,
    state,
    port: address.port,
    async close() {
      await new Promise((resolve) => server.close(resolve));
    },
  };
}

function yamlString(value) {
  return JSON.stringify(String(value));
}

export function writeDshPatches({ controlDir, port, phase, researchMcp = null }) {
  fs.mkdirSync(controlDir, { recursive: true });
  const parent = path.join(controlDir, `parent-${phase}.yml`);
  const role = path.join(controlDir, `role-${phase}.yml`);
  const guardPlugin = path.join(controlDir, 'dsh-tool-call-guard.mjs');
  fs.copyFileSync(toolGuardSource, guardPlugin);

  fs.writeFileSync(parent, `- id: llm-pi-ai
  config:
    providers:
      smokestack-openrouter:
        displayName: Smokestack Sprint OpenRouter capped
        apiKeyEnv: OPENROUTER_API_KEY
        api: openai-completions
        baseURL: http://127.0.0.1:${port}/api/v1
        compat:
          thinkingFormat: openrouter
        retryPolicy:
          mode: normal
          maxRetries: 0
        models:
          - id: deepseek/deepseek-v4-flash-0731
            name: DeepSeek V4 Flash 0731
            contextWindow: 1310720
            maxTokens: 8192
`);

  const rows = [
    `- id: smokestack-tool-call-guard
  name: './dsh-tool-call-guard.mjs'
`,
  ];
  const guardLimits = {};
  const guardObserve = [];
  if (phase === 'research') {
    rows.push(`- id: tool-subagent-codex-implementer
  disabled: true
`);
    rows.push(`- id: tool-subagent-claude-reviewer
  disabled: true
`);
    if (!researchMcp) throw new Error('research phase requires researchMcp configuration');
    guardObserve.push('mcp__literature__search_literature', 'mcp__literature__verify_source');
    rows.push(`- id: mcp-sprint-literature
  name: '@deepseek-ai/dsh-mcp-client'
  config:
    serverName: literature
    transport: stdio
    command: ${yamlString(researchMcp.command)}
    args: [${(researchMcp.args ?? []).map(yamlString).join(', ')}]
    failOnStartupError: true
    toolCallTimeoutMs: ${Number(researchMcp.toolCallTimeoutMs ?? 60000)}
    reconnect:
      enabled: false
`);
  } else if (phase === 'implement' || phase === 'repair') {
    guardLimits.subagent_codex_implementer = 1;
    rows.push(`- id: tool-subagent-claude-reviewer
  disabled: true
`);
  } else if (phase === 'review' || phase === 'rereview') {
    guardLimits.subagent_claude_reviewer = 1;
    rows.push(`- id: tool-subagent-codex-implementer
  disabled: true
`);
  } else {
    throw new Error(`unsupported DSH phase: ${phase}`);
  }
  fs.writeFileSync(role, rows.join('\n'));
  return { parent, role, guardLimits, guardObserve };
}

export function readToolGuardTranscript(input) {
  const complete = typeof input === 'object' && input !== null
    ? input.complete === true
    : true;
  const transcript = typeof input === 'string'
    ? input
    : typeof input?.data === 'string' ? input.data : '';
  if (!complete) return { ok: false, error: 'trusted tool transcript incomplete', events: [] };
  if (transcript.length === 0) return { ok: false, error: 'trusted tool transcript missing', events: [] };
  if (!transcript.endsWith('\n')) return { ok: false, error: 'trusted tool transcript truncated', events: [] };
  const events = [];
  const lines = transcript.split(/\r?\n/);
  lines.pop();
  try {
    for (const line of lines) {
      if (line.length === 0) throw new Error('invalid blank trusted tool transcript frame');
      const event = JSON.parse(line);
      if (!event || typeof event !== 'object' || typeof event.stage !== 'string' || typeof event.name !== 'string') {
        throw new Error('invalid trusted tool transcript event');
      }
      events.push(event);
    }
  } catch (err) {
    return { ok: false, error: err.message, events: [] };
  }
  return { ok: true, error: null, events };
}

export function parseReviewGate(text) {
  const gates = [...String(text).matchAll(/REVIEW_GATE:\s*(NO_CRITICAL_HIGH|CRITICAL_HIGH_FOUND)/g)]
    .map((m) => m[1]);
  const unique = [...new Set(gates)];
  return unique.length === 1 ? unique[0] : 'AMBIGUOUS';
}

export function parseResearchReceipt(text) {
  const gates = [...String(text).matchAll(/RESEARCH_GATE:\s*(PASS|BLOCKED)/g)].map((m) => m[1]);
  const uniqueGates = [...new Set(gates)];
  if (uniqueGates.length !== 1) return { gate: 'AMBIGUOUS', evidence: null };
  const lines = String(text).split(/\r?\n/).filter((line) => line.startsWith('EVIDENCE_JSON:'));
  if (lines.length !== 1) return { gate: uniqueGates[0], evidence: null };
  try {
    return { gate: uniqueGates[0], evidence: JSON.parse(lines[0].slice('EVIDENCE_JSON:'.length).trim()) };
  } catch {
    return { gate: uniqueGates[0], evidence: null };
  }
}

export async function dshRun({ cwd, patches, prompt, label, timeoutSeconds = 300 }) {
  return runAsync('timeout', [
    '--kill-after=5s', `${timeoutSeconds}s`,
    'smokestack-dsh', '--profile', 'headless',
    '--patch', patches.parent,
    '--patch', patches.role,
    prompt,
  ], {
    cwd,
    env: {
      DSH_PERMISSION_MODE: 'read-only',
      DSH_TOOLS_MODE: 'native',
      DSH_SMOKESTACK_TOOL_GUARD_FD: '3',
      SMOKESTACK_TOOL_GUARD_LIMITS: JSON.stringify(patches.guardLimits ?? {}),
      SMOKESTACK_TOOL_GUARD_OBSERVE: JSON.stringify(patches.guardObserve ?? []),
    },
    trustedChannel: true,
    timeoutMs: (timeoutSeconds + 10) * 1000,
    label,
  });
}

export function ensureMcpPluginInstalled() {
  const list = runSync('smokestack-dsh', ['plugin', '--profile', 'headless', 'list'], { timeoutMs: 120_000 });
  if (list.exit !== 0) throw new Error(`cannot inspect DSH plugin profile: ${list.stderr || list.stdout}`);
  if (list.stdout.includes('@deepseek-ai/dsh-mcp-client')) return { installed: true, changed: false };

  const add = runSync('smokestack-dsh', [
    'plugin', '--profile', 'headless', 'add', '@deepseek-ai/dsh-mcp-client@0.1.1-rc.2',
  ], { timeoutMs: 300_000 });
  if (add.exit !== 0) throw new Error(`cannot install pinned DSH MCP client: ${add.stderr || add.stdout}`);
  const verify = runSync('smokestack-dsh', ['plugin', '--profile', 'headless', 'list'], { timeoutMs: 120_000 });
  if (verify.exit !== 0 || !verify.stdout.includes('@deepseek-ai/dsh-mcp-client')) {
    throw new Error('DSH MCP client install did not reconcile into the headless profile');
  }
  return { installed: true, changed: true };
}
