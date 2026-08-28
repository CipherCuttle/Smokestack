import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { readFileSync } from 'node:fs';
import { createPublicKey, randomUUID, timingSafeEqual, type KeyObject } from 'node:crypto';
import { loadEd25519PrivateKey, keyIdForPublicKey, publicKeyToWire, signReceipt, signCheckpoint } from './crypto.js';
import { canonicalize, nowUtcSecond, requireExactKeys, requireJsonObject, requireString, sha256 } from './canonical.js';
import { WitnessProtocolError, protocolError } from './errors.js';
import { validateAppendEventRequest, validateCheckpoint, validateClaimRequest, validateNamespaceIdentity, validateReadRequest, validateRecord, validateRootRequest } from './protocol.js';
import { verifyConsistency, verifyInclusion } from './verification.js';
import { WitnessStore, type InternalAppendResult, type InternalClaimResult, type WitnessStoreIdentity } from './store.js';
import type { CheckpointBody, JsonObject, WitnessCheckpoint, WitnessReceipt, WitnessRecord } from './types.js';

const MAX_BODY_BYTES = 2 * 1024 * 1024;

interface ServiceConfig {
  host: string;
  port: number;
  databasePath: string;
  deploymentId: string;
  databaseInstanceId: string;
  signingKeyPath: string;
  runtimeToken: string;
  adminToken: string;
  crashPoint: string | undefined;
}

interface ServiceRuntime {
  config: ServiceConfig;
  signer?: KeyObject;
  publicKey?: KeyObject;
  publicKeyWire?: string;
  keyId?: string;
  store?: WitnessStore;
  reasons: string[];
}

export function createWitnessServer(environment: NodeJS.ProcessEnv = process.env): { server: Server; runtime: ServiceRuntime } {
  const runtime = initializeRuntime(environment);
  const server = createServer((request, response) => {
    void handleRequest(runtime, request, response);
  });
  return { server, runtime };
}

function initializeRuntime(environment: NodeJS.ProcessEnv): ServiceRuntime {
  const reasons: string[] = [];
  const configResult = readConfig(environment, reasons);
  const runtime: ServiceRuntime = { config: configResult, reasons };
  if (configResult.signingKeyPath.length > 0) {
    try {
      const privateKey = loadEd25519PrivateKey(readFileSync(configResult.signingKeyPath, 'utf8'));
      const derivedPublicKey = createPublicKey(privateKey);
      runtime.signer = privateKey;
      runtime.publicKey = derivedPublicKey;
      runtime.publicKeyWire = publicKeyToWire(derivedPublicKey);
      runtime.keyId = keyIdForPublicKey(derivedPublicKey);
    } catch {
      reasons.push('signing_identity_unavailable');
    }
  }
  if (configResult.databasePath.length > 0 && configResult.deploymentId.length > 0 && configResult.databaseInstanceId.length > 0 && runtime.keyId !== undefined) {
    try {
      const identity: WitnessStoreIdentity = {
        deployment_id: configResult.deploymentId,
        database_instance_id: configResult.databaseInstanceId,
        signing_key_id: runtime.keyId,
      };
      runtime.store = new WitnessStore(configResult.databasePath, identity, {
        beforeCommit: (operation) => {
          if (configResult.crashPoint === `${operation}_before_commit`) {
            process.kill(process.pid, 'SIGKILL');
          }
        },
      });
    } catch {
      reasons.push('persistence_unavailable_or_integrity_failed');
    }
  }
  if (reasons.length > 0) {
    return runtime;
  }
  if (runtime.signer === undefined || runtime.publicKey === undefined || runtime.publicKeyWire === undefined || runtime.keyId === undefined || runtime.store === undefined) {
    reasons.push('runtime_dependencies_unavailable');
  }
  return runtime;
}

function readConfig(environment: NodeJS.ProcessEnv, reasons: string[]): ServiceConfig {
  const host = environment.WITNESS_HOST ?? '127.0.0.1';
  const rawPort = environment.WITNESS_PORT ?? '8787';
  const parsedPort = Number(rawPort);
  const port = Number.isInteger(parsedPort) && parsedPort >= 0 && parsedPort <= 65535 ? parsedPort : 8787;
  if (String(parsedPort) !== rawPort || !Number.isInteger(parsedPort) || parsedPort < 0 || parsedPort > 65535) {
    reasons.push('invalid_listener_configuration');
  }
  const databasePath = environment.WITNESS_DATABASE_PATH ?? '';
  const deploymentId = environment.WITNESS_DEPLOYMENT_ID ?? '';
  const databaseInstanceId = environment.WITNESS_DATABASE_INSTANCE_ID ?? '';
  const signingKeyPath = environment.WITNESS_SIGNING_KEY_PATH ?? '';
  const runtimeToken = environment.WITNESS_RUNTIME_TOKEN ?? '';
  const adminToken = environment.WITNESS_ADMIN_TOKEN ?? '';
  if (databasePath.length === 0) {
    reasons.push('missing_persistence_configuration');
  }
  if (deploymentId.length === 0) {
    reasons.push('missing_deployment_identity');
  }
  if (databaseInstanceId.length === 0) {
    reasons.push('missing_database_instance_identity');
  }
  if (signingKeyPath.length === 0) {
    reasons.push('missing_signing_key_reference');
  }
  if (runtimeToken.length < 16) {
    reasons.push('invalid_runtime_credential_configuration');
  }
  if (adminToken.length < 16 || adminToken === runtimeToken) {
    reasons.push('invalid_admin_credential_configuration');
  }
  return { host, port, databasePath, deploymentId, databaseInstanceId, signingKeyPath, runtimeToken, adminToken, crashPoint: environment.WITNESS_TEST_CRASH_POINT };
}

async function handleRequest(runtime: ServiceRuntime, request: IncomingMessage, response: ServerResponse): Promise<void> {
  const requestId = cryptoRandomUuid();
  const startedAt = Date.now();
  const operation = operationName(request.method, request.url);
  let status = 500;
  let namespace: string | undefined;
  try {
    if (request.method === 'GET' && request.url === '/healthz') {
      status = 200;
      sendJson(response, status, { alive: true, ready: runtime.reasons.length === 0, request_id: requestId });
      return;
    }
    if (request.method === 'GET' && request.url === '/readyz') {
      status = runtime.reasons.length === 0 ? 200 : 503;
      sendJson(response, status, { alive: true, ready: runtime.reasons.length === 0, reasons: runtime.reasons, request_id: requestId });
      return;
    }
    authorizeRuntime(request, runtime.config.runtimeToken);
    const body = request.method === 'GET' ? undefined : await readRequestBody(request);
    if (request.url === '/v1/public-key' && request.method === 'GET') {
      ensureReady(runtime);
      status = 200;
      sendJson(response, status, { algorithm: 'Ed25519', public_key: runtime.publicKeyWire, key_id: runtime.keyId });
      return;
    }
    ensureReady(runtime);
    if (runtime.store === undefined || runtime.signer === undefined || runtime.publicKey === undefined || runtime.keyId === undefined) {
      protocolError('NOT_READY', 'witness service is not ready', 503);
    }
    if (request.method === 'POST' && request.url === '/v1/namespaces/root') {
      const parsed = validateRootRequest(parseBody(body));
      namespace = parsed.namespace;
      const root = runtime.store.createOrGetNamespaceRoot(parsed.namespace, parsed.frozenGenesisPayload);
      const genesis = runtime.store.readEvent(parsed.namespace, root.genesis_id, 0);
      const checkpoint = checkpointFor(runtime.signer, root, genesis.sequence, genesis.record_digest, genesis.included_at, runtime.keyId);
      const receipt = receiptFor(runtime.signer, genesis, checkpoint, runtime.keyId);
      status = 200;
      sendJson(response, status, {
        namespace_genesis_id: root.genesis_id,
        namespace_genesis_digest: root.genesis_digest,
        namespace_genesis_receipt: receipt,
        namespace_genesis_checkpoint: checkpoint,
      });
      return;
    }
    if (request.method === 'POST' && request.url === '/v1/claims/once') {
      const parsed = validateClaimRequest(parseBody(body));
      namespace = parsed.exact_window_object.namespace;
      const result = runtime.store.claimOnce(parsed);
      const root = runtime.store.namespace(namespace, result.episode_binding.namespace_genesis_id);
      const checkpoint = checkpointFor(runtime.signer, root, result.record.sequence, result.record.record_digest, result.record.included_at, runtime.keyId);
      const receipt = receiptFor(runtime.signer, result.record, checkpoint, runtime.keyId);
      maybeCrashAfterCommit(runtime, 'claim');
      status = 201;
      sendJson(response, status, { record: result.record, receipt, checkpoint, episode_binding: result.episode_binding });
      return;
    }
    if (request.method === 'POST' && request.url === '/v1/events/append') {
      const parsed = validateAppendEventRequest(parseBody(body));
      namespace = parsed.namespace;
      const result = runtime.store.appendEvent(parsed);
      const root = runtime.store.namespace(namespace, parsed.episode_binding.namespace_genesis_id);
      const checkpoint = checkpointFor(runtime.signer, root, result.record.sequence, result.record.record_digest, result.record.included_at, runtime.keyId);
      const receipt = receiptFor(runtime.signer, result.record, checkpoint, runtime.keyId);
      status = 201;
      sendJson(response, status, { record: result.record, receipt, checkpoint });
      return;
    }
    if (request.method === 'POST' && request.url === '/v1/events/read') {
      const parsed = validateReadRequest(parseBody(body));
      namespace = parsed.namespace;
      const record = runtime.store.readEvent(parsed.namespace, parsed.namespaceGenesisId, parsed.sequence);
      const root = runtime.store.namespace(parsed.namespace, parsed.namespaceGenesisId);
      const records = runtime.store.listEvents(parsed.namespace, parsed.namespaceGenesisId);
      const head = records.at(-1);
      if (head === undefined) {
        protocolError('CORRUPT_PERSISTENCE', 'namespace has no current head', 503);
      }
      const checkpoint = checkpointFor(runtime.signer, root, head.sequence, head.record_digest, nowUtcSecond(), runtime.keyId);
      const receipt = receiptFor(runtime.signer, record, checkpoint, runtime.keyId);
      status = 200;
      sendJson(response, status, { record, receipt, checkpoint });
      return;
    }
    if (request.method === 'POST' && request.url === '/v1/namespaces/list') {
      const identity = validateNamespaceIdentity(parseBody(body), 'list request');
      namespace = identity.namespace;
      const records = runtime.store.listEvents(identity.namespace, identity.namespaceGenesisId);
      const root = runtime.store.namespace(identity.namespace, identity.namespaceGenesisId);
      const head = records.at(-1);
      if (head === undefined) {
        protocolError('CORRUPT_PERSISTENCE', 'namespace enumeration is empty', 503);
      }
      const checkpoint = checkpointFor(runtime.signer, root, head.sequence, head.record_digest, nowUtcSecond(), runtime.keyId);
      status = 200;
      sendJson(response, status, { namespace: identity.namespace, namespace_genesis_id: root.genesis_id, records, checkpoint });
      return;
    }
    if (request.method === 'POST' && request.url === '/v1/checkpoints/current') {
      const identity = validateNamespaceIdentity(parseBody(body), 'checkpoint request');
      namespace = identity.namespace;
      const records = runtime.store.listEvents(identity.namespace, identity.namespaceGenesisId);
      const root = runtime.store.namespace(identity.namespace, identity.namespaceGenesisId);
      const head = records.at(-1);
      if (head === undefined) {
        protocolError('CORRUPT_PERSISTENCE', 'namespace has no head record', 503);
      }
      status = 200;
      sendJson(response, status, checkpointFor(runtime.signer, root, head.sequence, head.record_digest, nowUtcSecond(), runtime.keyId));
      return;
    }
    if (request.method === 'POST' && request.url === '/v1/verify/inclusion') {
      const parsed = validateInclusionRequest(parseBody(body));
      const result = verifyInclusion(runtime.publicKey, parsed.checkpoint, parsed.records, parsed.targetSequence);
      status = 200;
      sendJson(response, status, result);
      return;
    }
    if (request.method === 'POST' && request.url === '/v1/verify/consistency') {
      const parsed = validateConsistencyRequest(parseBody(body));
      const result = verifyConsistency(runtime.publicKey, parsed.oldCheckpoint, parsed.newCheckpoint, parsed.records);
      status = 200;
      sendJson(response, status, result);
      return;
    }
    status = 404;
    sendJson(response, status, { error: { code: 'NOT_FOUND', message: 'operation is not available' }, request_id: requestId });
  } catch (error) {
    const protocol = error instanceof WitnessProtocolError ? error : undefined;
    status = protocol?.status ?? 500;
    sendJson(response, status, {
      error: {
        code: protocol?.code ?? 'INTERNAL_ERROR',
        message: protocol?.message ?? 'witness operation failed',
      },
      request_id: requestId,
    });
  } finally {
    logRequest(requestId, operation, namespace, status, Date.now() - startedAt);
  }
}

function ensureReady(runtime: ServiceRuntime): void {
  if (runtime.reasons.length !== 0) {
    protocolError('NOT_READY', 'witness service is not ready', 503);
  }
}

function authorizeRuntime(request: IncomingMessage, expected: string): void {
  const header = request.headers.authorization;
  if (typeof header !== 'string' || !header.startsWith('Bearer ')) {
    protocolError('UNAUTHENTICATED', 'runtime credential is required', 401);
  }
  const supplied = Buffer.from(header.slice('Bearer '.length), 'utf8');
  const configured = Buffer.from(expected, 'utf8');
  if (supplied.length !== configured.length || !timingSafeEqual(supplied, configured)) {
    protocolError('UNAUTHENTICATED', 'runtime credential is invalid', 401);
  }
}

async function readRequestBody(request: IncomingMessage): Promise<string> {
  const contentLength = request.headers['content-length'];
  if (typeof contentLength === 'string' && Number(contentLength) > MAX_BODY_BYTES) {
    protocolError('REQUEST_TOO_LARGE', 'request body exceeds the configured limit', 413);
  }
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > MAX_BODY_BYTES) {
      protocolError('REQUEST_TOO_LARGE', 'request body exceeds the configured limit', 413);
    }
    chunks.push(buffer);
  }
  return Buffer.concat(chunks).toString('utf8');
}

function parseBody(body: string | undefined): unknown {
  if (body === undefined) {
    protocolError('INVALID_REQUEST', 'JSON request body is required');
  }
  try {
    return JSON.parse(body) as unknown;
  } catch {
    protocolError('INVALID_JSON', 'request body must be valid JSON');
  }
}

function checkpointFor(signer: KeyObject, root: { namespace: string; genesis_digest: string }, headSequence: number, headRecordDigest: string, checkpointTime: string, keyId: string): WitnessCheckpoint {
  const body: CheckpointBody = {
    checkpoint_type: 'WITNESS_CHECKPOINT_V0',
    namespace: root.namespace,
    genesis_digest: root.genesis_digest,
    head_sequence: headSequence,
    head_record_digest: headRecordDigest,
    checkpoint_time: checkpointTime,
    key_id: keyId,
  };
  return signCheckpoint(signer, body);
}

function receiptFor(signer: KeyObject, record: WitnessRecord, checkpoint: WitnessCheckpoint, keyId: string): WitnessReceipt {
  return signReceipt(signer, {
    receipt_type: 'WITNESS_RECEIPT_V0',
    namespace: record.namespace,
    sequence: record.sequence,
    record_digest: record.record_digest,
    included_at: record.included_at,
    checkpoint_digest: checkpoint.checkpoint_digest,
    key_id: keyId,
  }, checkpoint);
}

function maybeCrashAfterCommit(runtime: ServiceRuntime, operation: 'claim'): void {
  if (runtime.config.crashPoint === `${operation}_after_commit`) {
    process.kill(process.pid, 'SIGKILL');
  }
}

function validateInclusionRequest(value: unknown): { checkpoint: WitnessCheckpoint; records: WitnessRecord[]; targetSequence: number } {
  const object = requireJsonObject(value, 'inclusion verification request');
  requireExactKeys(object, ['checkpoint', 'records', 'target_sequence'], 'inclusion verification request');
  const target = object.target_sequence;
  if (typeof target !== 'number' || !Number.isSafeInteger(target) || target < 0) {
    protocolError('INVALID_SEQUENCE', 'target_sequence must be a non-negative safe integer');
  }
  if (!Array.isArray(object.records)) {
    protocolError('INVALID_RECORDS', 'records must be an array');
  }
  return { checkpoint: validateCheckpoint(object.checkpoint), records: object.records.map((record) => validateRecord(record)), targetSequence: target };
}

function validateConsistencyRequest(value: unknown): { oldCheckpoint: WitnessCheckpoint; newCheckpoint: WitnessCheckpoint; records: WitnessRecord[] } {
  const object = requireJsonObject(value, 'consistency verification request');
  requireExactKeys(object, ['old_checkpoint', 'new_checkpoint', 'records'], 'consistency verification request');
  if (!Array.isArray(object.records)) {
    protocolError('INVALID_RECORDS', 'records must be an array');
  }
  return { oldCheckpoint: validateCheckpoint(object.old_checkpoint), newCheckpoint: validateCheckpoint(object.new_checkpoint), records: object.records.map((record) => validateRecord(record)) };
}

function cryptoRandomUuid(): string {
  return randomUUID();
}

function operationName(method: string | undefined, url: string | undefined): string {
  return `${method ?? 'UNKNOWN'} ${url ?? 'UNKNOWN'}`;
}

function logRequest(requestId: string, operation: string, namespace: string | undefined, status: number, latencyMs: number): void {
  const entry: Record<string, string | number | boolean> = { request_id: requestId, operation, status, latency_ms: latencyMs, success: status < 400 };
  if (namespace !== undefined) {
    entry.namespace_digest = sha256(namespace);
  }
  process.stdout.write(`${JSON.stringify(entry)}\n`);
}

function sendJson(response: ServerResponse, status: number, value: unknown): void {
  if (response.headersSent) {
    return;
  }
  const body = JSON.stringify(value);
  response.statusCode = status;
  response.setHeader('content-type', 'application/json; charset=utf-8');
  response.setHeader('cache-control', 'no-store');
  response.end(body);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { server, runtime } = createWitnessServer();
  server.listen(runtime.config.port, runtime.config.host, () => {
    const address = server.address();
    const port = typeof address === 'object' && address !== null ? address.port : runtime.config.port;
    process.stdout.write(`${JSON.stringify({ event: 'listening', host: runtime.config.host, port, ready: runtime.reasons.length === 0 })}\n`);
  });
  const shutdown = (): void => {
    runtime.store?.close();
    server.close(() => process.exit(0));
  };
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
}
