import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPublicKey, generateKeyPairSync, randomUUID, type KeyObject } from 'node:crypto';
import { spawn, type ChildProcess } from 'node:child_process';
import test from 'node:test';
import { sha256 } from '../src/witness/canonical.js';
import { signWriterEvent, publicKeyToWire, verifyReceipt } from '../src/witness/crypto.js';
import { WitnessClient, type RawResponse } from '../src/witness/client.js';
import { verifyConsistency, verifyInclusion } from '../src/witness/verification.js';
import type { EpisodeBinding, ExactWindowObject, JsonObject, NamespaceRootResult, TerminalContractBinding, WitnessRecord } from '../src/witness/types.js';

const RUNTIME_TOKEN = 'test-runtime-credential-0123456789';
const ADMIN_TOKEN = 'test-admin-credential-9876543210';
const SERVICE_FILE = fileURLToPath(new URL('../src/witness/service.js', import.meta.url));

interface TestEnvironment {
  directory: string;
  databasePath: string;
  keyPath: string;
  port: number;
  witnessPublicKey: KeyObject;
  witnessPublicKeyWire: string;
}

interface RunningService {
  child: ChildProcess;
  client: WitnessClient;
}

interface WriterMaterial {
  privateKey: KeyObject;
  publicKey: KeyObject;
  publicKeyWire: string;
}

interface ClaimMaterial {
  window: ExactWindowObject;
  windowClaimKey: string;
  episodeBinding: EpisodeBinding;
  terminalBinding: TerminalContractBinding;
  writer: WriterMaterial;
  body: JsonObject;
}

test('network boundary, readiness, and concurrent root creation are durable and idempotent', async () => {
  await withService(async ({ environment, running }) => {
    const health = await running.client.health();
    assert.equal(health.status, 200);
    assert.deepEqual(health.body && typeof health.body === 'object' ? (health.body as { alive: boolean }).alive : false, true);
    assert.equal((await running.client.readiness()).status, 200);
    const namespace = testNamespace();
    const payload = rootPayload(namespace);
    const [first, second] = await Promise.all([
      running.client.namespaceRoot(namespace, payload),
      running.client.namespaceRoot(namespace, payload),
    ]);
    assert.deepEqual(first, second);
    const list = await running.client.listNamespace(namespace, first.namespace_genesis_id);
    assert.equal(list.records.length, 1);
    assert.equal(list.records[0]?.sequence, 0);
    assert.equal(list.records[0]?.record_type, 'GENESIS');
    assert.equal(list.records[0]?.record_digest, first.namespace_genesis_digest);
    assert.equal(verifyReceipt(environment.witnessPublicKey, first.namespace_genesis_receipt), true);
    assert.deepEqual(first.namespace_genesis_receipt.checkpoint, first.namespace_genesis_checkpoint);
  });
});

test('claim once serializes identical claims, rejects shifted overlap, and permits disjoint intervals', async () => {
  await withService(async ({ environment, running }) => {
    const namespace = testNamespace();
    const root = await running.client.namespaceRoot(namespace, rootPayload(namespace));
    const first = claimMaterial(namespace, root, 0);
    const simultaneous = await Promise.all([
      running.client.raw('/v1/claims/once', 'POST', first.body),
      running.client.raw('/v1/claims/once', 'POST', first.body),
    ]);
    assert.deepEqual(simultaneous.map((response) => response.status).sort((a, b) => a - b), [201, 409]);
    const shifted = claimMaterial(namespace, root, 0, writerMaterial(), 30 * 60 * 1000, 90 * 60 * 1000);
    const shiftedResponse = await running.client.raw('/v1/claims/once', 'POST', shifted.body);
    assert.equal(shiftedResponse.status, 409);
    assert.equal(errorCode(shiftedResponse), 'WINDOW_OVERLAP');
    const disjoint = claimMaterial(namespace, root, 2, first.writer, 2 * 60 * 60 * 1000, 3 * 60 * 60 * 1000);
    const disjointResponse = await running.client.raw('/v1/claims/once', 'POST', disjoint.body);
    assert.equal(disjointResponse.status, 201);
    const list = await running.client.listNamespace(namespace, root.namespace_genesis_id);
    assert.equal(list.records.filter((record) => record.record_type === 'CLAIM').length, 2);
  });
});

test('server recomputes the window key, binds the full terminal object, and assigns included_at', async () => {
  await withService(async ({ environment, running }) => {
    const namespace = testNamespace();
    const root = await running.client.namespaceRoot(namespace, rootPayload(namespace));
    const claim = claimMaterial(namespace, root, 0);
    const wrongKeyBody = { ...claim.body, window_claim_key: '0'.repeat(64) };
    const wrongKey = await running.client.raw('/v1/claims/once', 'POST', wrongKeyBody);
    assert.equal(wrongKey.status, 400);
    assert.equal(errorCode(wrongKey), 'WINDOW_CLAIM_KEY_MISMATCH');
    const missingTerminalMember = { ...claim.body, TERMINAL_CONTRACT_BINDING: { ...claim.terminalBinding, execution_authorization_json_sha256: undefined } };
    const missingTerminal = await running.client.raw('/v1/claims/once', 'POST', missingTerminalMember);
    assert.equal(missingTerminal.status, 400);
    assert.equal(errorCode(missingTerminal), 'INVALID_MEMBERS');
    const result = await running.client.claimOnce(claim.window, claim.windowClaimKey, claim.episodeBinding, claim.terminalBinding);
    assert.match(result.record.included_at, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/u);
    const recordedWindow = result.record.payload.exact_window_object as unknown as ExactWindowObject;
    assert.equal(recordedWindow.window_start, claim.window.window_start);
    assert.equal(recordedWindow.window_end, claim.window.window_end);
    assert.equal('included_at' in result.record.payload, false);
    assert.equal(verifyReceipt(environment.witnessPublicKey, result.receipt), true);
  });
});

test('claim receipt and interval survive restart and a fresh client cannot bypass consumption', async () => {
  await withEnvironment(async (environment) => {
    const firstService = await startService(environment);
    const namespace = testNamespace();
    const root = await firstService.client.namespaceRoot(namespace, rootPayload(namespace));
    const claim = claimMaterial(namespace, root, 0);
    const claimed = await firstService.client.claimOnce(claim.window, claim.windowClaimKey, claim.episodeBinding, claim.terminalBinding);
    await stopService(firstService);
    const restarted = await startService(environment);
    try {
      const rootAgain = await restarted.client.namespaceRoot(namespace, rootPayload(namespace));
      assert.deepEqual(rootAgain, root);
      const recovered = await restarted.client.readEvent(namespace, root.namespace_genesis_id, claimed.record.sequence);
      assert.deepEqual(recovered.record, claimed.record);
      assert.deepEqual(recovered.receipt, claimed.receipt);
      const freshClient = new WitnessClient(`http://127.0.0.1:${environment.port}`, RUNTIME_TOKEN);
      const bypassClaim = claimMaterial(namespace, root, 0);
      const bypass = await freshClient.raw('/v1/claims/once', 'POST', bypassClaim.body);
      assert.equal(bypass.status, 409);
      assert.equal(errorCode(bypass), 'WINDOW_OVERLAP');
      assert.equal((await restarted.client.listNamespace(namespace, root.namespace_genesis_id)).records.length, 2);
    } finally {
      await stopService(restarted);
    }
  });
});

test('crash before commit rolls back claim and crash after commit leaves discoverable claim', async () => {
  await withEnvironment(async (environment) => {
    const normal = await startService(environment);
    const namespace = testNamespace();
    const root = await normal.client.namespaceRoot(namespace, rootPayload(namespace));
    const beforeCommitClaim = claimMaterial(namespace, root, 0);
    await stopService(normal);
    const crashingBefore = await startService(environment, 'claim_before_commit');
    try {
      await expectConnectionFailure(crashingBefore.client.claimOnce(beforeCommitClaim.window, beforeCommitClaim.windowClaimKey, beforeCommitClaim.episodeBinding, beforeCommitClaim.terminalBinding));
      await waitForExit(crashingBefore.child);
    } finally {
      await stopService(crashingBefore);
    }
    const recoveredAfterRollback = await startService(environment);
    const noClaim = await recoveredAfterRollback.client.listNamespace(namespace, root.namespace_genesis_id);
    assert.equal(noClaim.records.length, 1);
    await stopService(recoveredAfterRollback);
    const crashingAfter = await startService(environment, 'claim_after_commit');
    try {
      const afterCommitClaim = claimMaterial(namespace, root, 1);
      await expectConnectionFailure(crashingAfter.client.claimOnce(afterCommitClaim.window, afterCommitClaim.windowClaimKey, afterCommitClaim.episodeBinding, afterCommitClaim.terminalBinding));
      await waitForExit(crashingAfter.child);
    } finally {
      await stopService(crashingAfter);
    }
    const recoveredAfterCommit = await startService(environment);
    try {
      const history = await recoveredAfterCommit.client.listNamespace(namespace, root.namespace_genesis_id);
      assert.equal(history.records.length, 2);
      assert.equal(history.records[1]?.record_type, 'CLAIM');
      const recoveredRecord = await recoveredAfterCommit.client.readEvent(namespace, root.namespace_genesis_id, 1);
      assert.equal(recoveredRecord.record.record_type, 'CLAIM');
      assert.equal(verifyReceipt(environment.witnessPublicKey, recoveredRecord.receipt), true);
    } finally {
      await stopService(recoveredAfterCommit);
    }
  });
});

test('writer signatures, immutable episode binding, and the terminal state machine are enforced', async () => {
  await withService(async ({ environment, running }) => {
    const namespace = testNamespace();
    const root = await running.client.namespaceRoot(namespace, rootPayload(namespace));
    const claim = claimMaterial(namespace, root, 0);
    const beforeClaim = await running.client.raw('/v1/events/append', 'POST', eventBody(namespace, claim.episodeBinding, claim.writer, 'CLAIM_ANCHORED', { anchor: 'too-early' }));
    assert.equal(beforeClaim.status, 404);
    await running.client.claimOnce(claim.window, claim.windowClaimKey, claim.episodeBinding, claim.terminalBinding);
    const anchored = eventBody(namespace, claim.episodeBinding, claim.writer, 'CLAIM_ANCHORED', { anchor: 'test' });
    const anchoredResult = await running.client.raw('/v1/events/append', 'POST', anchored);
    assert.equal(anchoredResult.status, 201);
    const duplicateAnchored = await running.client.raw('/v1/events/append', 'POST', anchored);
    assert.equal(duplicateAnchored.status, 409);
    assert.equal(errorCode(duplicateAnchored), 'ILLEGAL_STATE_TRANSITION');
    const prematureSample = eventBody(namespace, claim.episodeBinding, claim.writer, 'SAMPLE_COMMITTED', { sample: 'too-early' });
    const prematureResult = await running.client.raw('/v1/events/append', 'POST', prematureSample);
    assert.equal(prematureResult.status, 409);
    const changedWriter = writerMaterial();
    const changedBinding = { ...claim.episodeBinding, writer_public_key: changedWriter.publicKeyWire };
    const changedWriterResult = await running.client.raw('/v1/events/append', 'POST', eventBody(namespace, changedBinding, changedWriter, 'DATA_STARTED', { started: true }));
    assert.equal(changedWriterResult.status, 409);
    assert.equal(errorCode(changedWriterResult), 'EPISODE_BINDING_MISMATCH');
    const invalidSignature = {
      ...eventBody(namespace, claim.episodeBinding, claim.writer, 'DATA_STARTED', { started: true }),
      writer_signature: signWriterEvent(changedWriter.privateKey, namespace, claim.episodeBinding, 'DATA_STARTED', { started: true }),
    };
    const invalidResult = await running.client.raw('/v1/events/append', 'POST', invalidSignature);
    assert.equal(invalidResult.status, 401);
    assert.equal(errorCode(invalidResult), 'INVALID_WRITER_SIGNATURE');
    for (const [eventType, payload] of [
      ['DATA_STARTED', { started: true }],
      ['CENSUS_CLOSED', { closed: true }],
      ['SAMPLE_COMMITTED', { committed: true }],
      ['TERMINAL_PASS', { passed: true }],
    ] as const) {
      const result = await running.client.raw('/v1/events/append', 'POST', eventBody(namespace, claim.episodeBinding, claim.writer, eventType, payload));
      assert.equal(result.status, 201);
    }
    const afterTerminal = await running.client.raw('/v1/events/append', 'POST', eventBody(namespace, claim.episodeBinding, claim.writer, 'TERMINAL_FAIL', { failed: true }));
    assert.equal(afterTerminal.status, 409);
    assert.equal(errorCode(afterTerminal), 'ILLEGAL_STATE_TRANSITION');
    const abortClaim = claimMaterial(namespace, root, 1);
    const abortClaimResult = await running.client.raw('/v1/claims/once', 'POST', abortClaim.body);
    assert.equal(abortClaimResult.status, 201);
    const abortResult = await running.client.raw('/v1/events/append', 'POST', eventBody(namespace, abortClaim.episodeBinding, abortClaim.writer, 'TERMINAL_ABORT', { aborted: true }));
    assert.equal(abortResult.status, 201);
  });
});

test('independent inclusion and consistency verification detect altered historical prefixes', async () => {
  await withService(async ({ environment, running }) => {
    const namespace = testNamespace();
    const root = await running.client.namespaceRoot(namespace, rootPayload(namespace));
    const claim = claimMaterial(namespace, root, 0);
    await running.client.claimOnce(claim.window, claim.windowClaimKey, claim.episodeBinding, claim.terminalBinding);
    const append = await running.client.appendEvent(namespace, claim.episodeBinding, 'CLAIM_ANCHORED', { anchor: 'test' }, signWriterEvent(claim.writer.privateKey, namespace, claim.episodeBinding, 'CLAIM_ANCHORED', { anchor: 'test' }));
    const history = await running.client.listNamespace(namespace, root.namespace_genesis_id);
    const publicKey = environment.witnessPublicKey;
    const inclusion = verifyInclusion(publicKey, history.checkpoint, history.records, append.record.sequence);
    assert.equal(inclusion.valid, true);
    assert.equal((await running.client.verifyInclusion(history.checkpoint, history.records, append.record.sequence)).valid, true);
    const consistency = verifyConsistency(publicKey, root.namespace_genesis_checkpoint, history.checkpoint, history.records);
    assert.equal(consistency.valid, true);
    const corrupted = history.records.map((record, index) => index === 0 ? { ...record, payload: { ...record.payload, tampered: true } } : record);
    assert.equal(verifyConsistency(publicKey, root.namespace_genesis_checkpoint, history.checkpoint, corrupted).valid, false);
    assert.equal((await running.client.verifyConsistency(root.namespace_genesis_checkpoint, history.checkpoint, corrupted)).valid, false);
    const backward = verifyConsistency(publicKey, history.checkpoint, root.namespace_genesis_checkpoint, history.records);
    assert.equal(backward.valid, false);
  });
});

test('startup integrity failure is fail-closed and runtime credentials have no destructive authority', async () => {
  await withEnvironment(async (environment) => {
    const service = await startService(environment);
    const namespace = testNamespace();
    const root = await service.client.namespaceRoot(namespace, rootPayload(namespace));
    await stopService(service);
    const database = new DatabaseSync(environment.databasePath);
    database.prepare('UPDATE records SET payload = ? WHERE namespace = ? AND sequence = 0').run('{"tampered":true}', namespace);
    database.close();
    const corrupted = await startService(environment);
    try {
      const health = await corrupted.client.health();
      assert.equal(health.status, 200);
      assert.equal((await corrupted.client.readiness()).status, 503);
      const list = await corrupted.client.raw('/v1/namespaces/list', 'POST', { namespace, namespace_genesis_id: root.namespace_genesis_id });
      assert.equal(list.status, 503);
    } finally {
      await stopService(corrupted);
    }
  });
  await withService(async ({ environment, running }) => {
    const namespace = testNamespace();
    const root = await running.client.namespaceRoot(namespace, rootPayload(namespace));
    const before = await running.client.listNamespace(namespace, root.namespace_genesis_id);
    const adminClient = new WitnessClient(`http://127.0.0.1:${environment.port}`, ADMIN_TOKEN);
    const runtimeRouteFromAdmin = await adminClient.raw('/v1/namespaces/list', 'POST', { namespace, namespace_genesis_id: root.namespace_genesis_id });
    assert.equal(runtimeRouteFromAdmin.status, 401);
    const noDeleteRoute = await running.client.raw('/v1/namespaces/delete', 'DELETE', { namespace });
    assert.equal(noDeleteRoute.status, 404);
    const noAdminRoute = await running.client.raw('/v1/admin/truncate', 'POST', { namespace });
    assert.equal(noAdminRoute.status, 404);
    const arbitraryStart = await running.client.raw('/v1/namespaces/list', 'POST', { namespace, namespace_genesis_id: root.namespace_genesis_id, from_sequence: 1 });
    assert.equal(arbitraryStart.status, 400);
    const mismatch = await running.client.raw('/v1/namespaces/root', 'POST', { namespace, frozen_genesis_payload: { ...rootPayload(namespace), changed: true } });
    assert.equal(mismatch.status, 409);
    const after = await running.client.listNamespace(namespace, root.namespace_genesis_id);
    assert.deepEqual(after.records, before.records);
  });
});

test('missing signing identity keeps the process alive but blocks witness operations', async () => {
  await withEnvironment(async (environment) => {
    const service = await startService(environment, undefined, { WITNESS_SIGNING_KEY_PATH: join(environment.directory, 'missing-signing-key.pem') });
    try {
      assert.equal((await service.client.health()).status, 200);
      const readiness = await service.client.readiness();
      assert.equal(readiness.status, 503);
      const root = await service.client.raw('/v1/namespaces/root', 'POST', { namespace: testNamespace(), frozen_genesis_payload: { protocol_id: 'test' } });
      assert.equal(root.status, 503);
    } finally {
      await stopService(service);
    }
  });
});

async function withService(callback: (context: { environment: TestEnvironment; running: RunningService }) => Promise<void>): Promise<void> {
  await withEnvironment(async (environment) => {
    const running = await startService(environment);
    try {
      await callback({ environment, running });
    } finally {
      await stopService(running);
    }
  });
}

async function withEnvironment(callback: (environment: TestEnvironment) => Promise<void>): Promise<void> {
  const environment = await provisionEnvironment();
  try {
    await callback(environment);
  } finally {
    await rm(environment.directory, { recursive: true, force: true });
  }
}

async function provisionEnvironment(): Promise<TestEnvironment> {
  const directory = await mkdtemp(join(tmpdir(), 'smokestack-witness-v0-'));
  const keyPath = join(directory, 'witness-signing-key.pem');
  const databasePath = join(directory, 'witness.sqlite');
  const pair = generateKeyPairSync('ed25519', {
    privateKeyEncoding: { format: 'pem', type: 'pkcs8' },
    publicKeyEncoding: { format: 'der', type: 'spki' },
  });
  await writeFile(keyPath, pair.privateKey, { mode: 0o600 });
  const actualPublicKey = createPublicKey({ key: pair.publicKey, format: 'der', type: 'spki' });
  return {
    directory,
    databasePath,
    keyPath,
    port: await freePort(),
    witnessPublicKey: actualPublicKey,
    witnessPublicKeyWire: publicKeyToWire(actualPublicKey),
  };
}

async function startService(environment: TestEnvironment, crashPoint?: string, overrides: Record<string, string> = {}): Promise<RunningService> {
  const child = spawn(process.execPath, [SERVICE_FILE], {
    env: {
      ...process.env,
      WITNESS_HOST: '127.0.0.1',
      WITNESS_PORT: String(environment.port),
      WITNESS_DATABASE_PATH: environment.databasePath,
      WITNESS_SIGNING_KEY_PATH: environment.keyPath,
      WITNESS_RUNTIME_TOKEN: RUNTIME_TOKEN,
      WITNESS_ADMIN_TOKEN: ADMIN_TOKEN,
      ...(crashPoint === undefined ? {} : { WITNESS_TEST_CRASH_POINT: crashPoint }),
      ...overrides,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout?.resume();
  child.stderr?.resume();
  const client = new WitnessClient(`http://127.0.0.1:${environment.port}`, RUNTIME_TOKEN);
  await waitFor(async () => {
    const response = await client.health().catch(() => undefined);
    return response?.status === 200;
  });
  return { child, client };
}

async function stopService(running: RunningService): Promise<void> {
  if (running.child.exitCode !== null || running.child.signalCode !== null) {
    return;
  }
  const exited = waitForExit(running.child, 3000);
  running.child.kill('SIGTERM');
  await exited;
}

function waitForExit(child: ChildProcess, timeoutMs = 5000): Promise<number | null> {
  if (child.exitCode !== null || child.signalCode !== null) {
    return Promise.resolve(child.exitCode);
  }
  return new Promise<number | null>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('witness service did not exit')), timeoutMs);
    child.once('exit', (code) => {
      clearTimeout(timer);
      resolve(code);
    });
  });
}

async function expectConnectionFailure(promise: Promise<unknown>): Promise<void> {
  await assert.rejects(promise);
}

async function waitFor(predicate: () => Promise<boolean>): Promise<void> {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    if (await predicate()) {
      return;
    }
    await new Promise<void>((resolve) => setTimeout(resolve, 25));
  }
  throw new Error('condition did not become true');
}

async function freePort(): Promise<number> {
  const server = createServer();
  return new Promise<number>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (typeof address !== 'object' || address === null) {
        reject(new Error('failed to allocate test port'));
        return;
      }
      const port = address.port;
      server.close((error) => error === undefined ? resolve(port) : reject(error));
    });
  });
}

function testNamespace(): string {
  return `smokestack:test:pr01-witness:${randomUUID()}`;
}

function rootPayload(namespace: string): JsonObject {
  return { namespace, protocol_id: 'SMOKESTACK_PRODUCTION_WITNESS_V0_TEST', canonical_predecessor: 'test-predecessor' };
}

function writerMaterial(): WriterMaterial {
  const pair = generateKeyPairSync('ed25519');
  return { privateKey: pair.privateKey, publicKey: pair.publicKey, publicKeyWire: publicKeyToWire(pair.publicKey) };
}

function claimMaterial(namespace: string, root: NamespaceRootResult, ordinal: number, writer = writerMaterial(), offsetMs = 0, endOffsetMs = 60 * 60 * 1000): ClaimMaterial {
  const start = new Date(Date.parse('2026-01-01T00:00:00Z') + ordinal * 24 * 60 * 60 * 1000 + offsetMs).toISOString().slice(0, 19) + 'Z';
  const end = new Date(Date.parse('2026-01-01T00:00:00Z') + ordinal * 24 * 60 * 60 * 1000 + endOffsetMs).toISOString().slice(0, 19) + 'Z';
  const window = { namespace, window_start: start, window_end: end } satisfies ExactWindowObject;
  const terminalBinding: TerminalContractBinding = {
    prereg_contract_id: 'PR01_SOURCE_QUALIFICATION_PREREGISTRATION_V5',
    prereg_terminal_commit: 'DEFERRED_TO_EXECUTION_AUTHORIZATION_AFTER_V5_TERMINAL_CLOSURE',
    prereg_json_sha256: 'DEFERRED_TO_EXECUTION_AUTHORIZATION_AFTER_V5_TERMINAL_CLOSURE',
    prereg_terminal_state: 'PASS_CLOSED',
    execution_authorization_contract_id: 'DEFERRED_TO_EXECUTION_AUTHORIZATION_AFTER_V5_TERMINAL_CLOSURE',
    execution_authorization_terminal_commit: 'DEFERRED_TO_EXECUTION_AUTHORIZATION_AFTER_V5_TERMINAL_CLOSURE',
    execution_authorization_json_sha256: 'DEFERRED_TO_EXECUTION_AUTHORIZATION_AFTER_V5_TERMINAL_CLOSURE',
  };
  const windowClaimKey = sha256(window);
  const episodeBinding: EpisodeBinding = {
    namespace_genesis_id: root.namespace_genesis_id,
    namespace_genesis_digest: root.namespace_genesis_digest,
    episode_id: `test-episode-${ordinal}-${randomUUID()}`,
    window_claim_key: windowClaimKey,
    initial_claim_digest: sha256(terminalBinding),
    writer_public_key: writer.publicKeyWire,
  };
  const body = { exact_window_object: window, window_claim_key: windowClaimKey, episode_binding: episodeBinding, TERMINAL_CONTRACT_BINDING: terminalBinding } satisfies JsonObject;
  return { window, windowClaimKey, episodeBinding, terminalBinding, writer, body };
}

function eventBody(namespace: string, binding: EpisodeBinding, writer: WriterMaterial, eventType: string, payload: JsonObject): JsonObject {
  return {
    namespace,
    episode_binding: binding,
    event_type: eventType,
    payload,
    writer_signature: signWriterEvent(writer.privateKey, namespace, binding, eventType, payload),
  };
}

function errorCode(response: RawResponse): string | undefined {
  if (response.body === null || typeof response.body !== 'object') {
    return undefined;
  }
  const body = response.body as { error?: { code?: string } };
  return body.error?.code;
}
