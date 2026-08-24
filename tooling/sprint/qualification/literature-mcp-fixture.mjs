import readline from 'node:readline';

const sources = [
  {
    id: 'FIXTURE:PIT-001',
    title: 'Point-in-time data prevents future-information leakage',
    url: 'fixture://literature/PIT-001',
    stance: 'supports',
    summary: 'A deterministic filter should include only observations known on or before the cutoff and reject malformed timestamps rather than coerce them.',
  },
  {
    id: 'FIXTURE:PIT-002',
    title: 'Boundary conventions must be explicit in temporal filters',
    url: 'fixture://literature/PIT-002',
    stance: 'supports',
    summary: 'Inclusive versus exclusive cutoff semantics must be frozen; equality at the declared cutoff is included in this fixture contract.',
  },
  {
    id: 'FIXTURE:PIT-003',
    title: 'Permissive coercion can silently contaminate temporal datasets',
    url: 'fixture://literature/PIT-003',
    stance: 'contradicts',
    summary: 'String and non-finite timestamps should not be treated as reliable point-in-time evidence.',
  },
];

const tools = [
  {
    name: 'search_literature',
    description: 'Search the qualification literature fixture. Read-only and deterministic.',
    inputSchema: {
      type: 'object',
      properties: { query: { type: 'string' } },
      required: ['query'],
      additionalProperties: false,
    },
  },
  {
    name: 'verify_source',
    description: 'Verify one source identifier returned by search_literature. Read-only and deterministic.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string' } },
      required: ['id'],
      additionalProperties: false,
    },
  },
];

function send(value) {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}
function ok(id, result) {
  send({ jsonrpc: '2.0', id, result });
}
function error(id, code, message) {
  send({ jsonrpc: '2.0', id, error: { code, message } });
}
function textResult(value) {
  return { content: [{ type: 'text', text: JSON.stringify(value) }] };
}
function handle(message) {
  if (!message || message.jsonrpc !== '2.0') return;
  if (message.method === 'notifications/initialized' || message.method?.startsWith('notifications/')) return;
  const id = message.id;
  if (message.method === 'initialize') {
    ok(id, {
      protocolVersion: message.params?.protocolVersion ?? '2025-11-25',
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: 'smokestack-literature-fixture', version: '0.1.0' },
    });
    return;
  }
  if (message.method === 'ping') {
    ok(id, {});
    return;
  }
  if (message.method === 'tools/list') {
    ok(id, { tools });
    return;
  }
  if (message.method === 'tools/call') {
    const name = message.params?.name;
    const args = message.params?.arguments ?? {};
    if (name === 'search_literature') {
      ok(id, textResult({ query: String(args.query ?? ''), sources, fixture: true }));
      return;
    }
    if (name === 'verify_source') {
      const source = sources.find((x) => x.id === args.id);
      if (!source) {
        ok(id, { ...textResult({ verified: false, id: args.id ?? null }), isError: true });
        return;
      }
      ok(id, textResult({ verified: true, source, fixture: true }));
      return;
    }
    error(id, -32601, `unknown tool: ${name}`);
    return;
  }
  error(id, -32601, `unknown method: ${message.method}`);
}

const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
rl.on('line', (line) => {
  if (!line.trim()) return;
  try { handle(JSON.parse(line)); }
  catch (err) { error(null, -32700, `parse error: ${err.message}`); }
});
