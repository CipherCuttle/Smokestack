import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';

const port = Number(process.env.PORT ?? 18731);
const stateFile = process.env.COUNT_FILE ?? '/tmp/smokestack-q5/parent-requests.json';

function fail(message) {
  console.error(`Q5_RESUME_CAP_FAIL: ${message}`);
  process.exit(1);
}

if (!fs.existsSync(stateFile)) {
  fail(`missing persisted counter: ${stateFile}`);
}

let state;
try {
  state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
} catch {
  fail(`invalid persisted counter JSON: ${stateFile}`);
}

const maxRequests = Number(state.max_requests);
let allowed = Number(state.allowed_requests);
let blocked = Number(state.blocked_requests);

if (
  !Number.isInteger(maxRequests) ||
  maxRequests !== 8 ||
  !Number.isInteger(allowed) ||
  allowed < 0 ||
  allowed > maxRequests ||
  !Number.isInteger(blocked) ||
  blocked < 0
) {
  fail(
    `counter invariant failed max=${state.max_requests} allowed=${state.allowed_requests} blocked=${state.blocked_requests}`,
  );
}

function persist() {
  fs.writeFileSync(
    stateFile,
    JSON.stringify(
      {
        ...state,
        max_requests: maxRequests,
        allowed_requests: allowed,
        blocked_requests: blocked,
      },
      null,
      2,
    ) + '\n',
    { mode: 0o600 },
  );
}

const server = http.createServer((req, res) => {
  const isParentRequest =
    req.method === 'POST' && req.url?.startsWith('/api/v1/') === true;

  if (isParentRequest) {
    if (allowed >= maxRequests) {
      blocked += 1;
      persist();
      console.error(
        `PARENT_REQUEST_BLOCKED allowed=${allowed} cap=${maxRequests}`,
      );
      res.writeHead(429, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify({
          error: {
            message: 'Smokestack Q5 parent request ceiling reached',
            type: 'smokestack_parent_budget_exhausted',
          },
        }),
      );
      return;
    }

    allowed += 1;
    persist();
    console.error(`PARENT_REQUEST_ALLOWED ${allowed}/${maxRequests}`);
  }

  const headers = { ...req.headers, host: 'openrouter.ai' };
  delete headers['content-length'];

  const upstream = https.request(
    {
      hostname: 'openrouter.ai',
      port: 443,
      path: req.url,
      method: req.method,
      headers,
    },
    (upstreamRes) => {
      res.writeHead(upstreamRes.statusCode ?? 502, upstreamRes.headers);
      upstreamRes.pipe(res);
    },
  );

  upstream.on('error', (error) => {
    console.error(`UPSTREAM_ERROR ${error.name}`);
    if (!res.headersSent) {
      res.writeHead(502, { 'content-type': 'application/json' });
    }
    res.end(
      JSON.stringify({
        error: { message: 'Q5 upstream transport failure' },
      }),
    );
  });

  req.pipe(upstream);
});

server.on('error', (error) => {
  fail(`listen error ${error.code ?? error.name}`);
});

server.listen(port, '127.0.0.1', () => {
  console.error(
    `Q5_RESUME_CAP_LISTENING port=${port} allowed=${allowed}/${maxRequests} blocked=${blocked}`,
  );
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
  });
}
