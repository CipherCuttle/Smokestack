import { existsSync, mkdirSync, statSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { canonicalize, nowUtcSecond, parseStoredJson, requireExactKeys, requireJsonObject, requireString, sha256 } from './canonical.js';
import { protocolError } from './errors.js';
import { publicKeyFromWire, verifyWriterEvent } from './crypto.js';
import { computeRecordDigest, verifyRecord } from './verification.js';
import { intervalMillis, validateAppendEventRequest, validateClaimRequest, validateEpisodeBinding, validateRecord, validateTerminalContractBinding, validateWindow } from './protocol.js';
import type { AppendEventRequest, ClaimRequest } from './protocol.js';
import type { EpisodeBinding, ExactWindowObject, JsonObject, RecordType, TerminalContractBinding, WitnessRecord } from './types.js';

interface NamespaceRow {
  namespace: string;
  genesis_id: string;
  genesis_digest: string;
  genesis_payload: string;
  head_sequence: number;
  head_record_digest: string;
  created_at: string;
}

interface RecordRow {
  namespace: string;
  sequence: number;
  record_type: string;
  payload_digest: string;
  previous_record_digest: string | null;
  record_digest: string;
  included_at: string;
  payload: string;
}

interface IntervalRow {
  namespace: string;
  window_claim_key: string;
  start_ms: number;
  end_ms: number;
  claim_sequence: number;
}

interface EpisodeRow {
  namespace: string;
  episode_id: string;
  binding: string;
  state: string;
  claim_sequence: number;
}

interface WitnessStoreHooks {
  beforeCommit?: (operation: 'root' | 'claim' | 'append') => void;
}

export interface WitnessStoreIdentity {
  deployment_id: string;
  database_instance_id: string;
  signing_key_id: string;
}

const STORE_METADATA_KEYS = ['database_instance_id', 'deployment_id', 'schema_version', 'signing_key_id'] as const;

export interface InternalClaimResult {
  record: WitnessRecord;
  episode_binding: EpisodeBinding;
}

export interface InternalAppendResult {
  record: WitnessRecord;
}

export function genesisIdFor(namespace: string, genesisPayloadDigest: string, genesisRecordDigest: string): string {
  return `witness-genesis-v0-${sha256({ namespace, genesis_payload_digest: genesisPayloadDigest, genesis_record_digest: genesisRecordDigest })}`;
}

export function initializeWitnessDatabase(databasePath: string, identity: WitnessStoreIdentity): void {
  validateStoreIdentity(identity);
  if (existsSync(databasePath)) {
    protocolError('PERSISTENCE_ALREADY_INITIALIZED', 'witness database path already exists; initialization is one-time only', 409);
  }
  mkdirSync(dirname(databasePath), { recursive: true });
  const database = new DatabaseSync(databasePath, { timeout: 5000, enableForeignKeyConstraints: true });
  try {
    configureDatabase(database);
    database.exec('BEGIN IMMEDIATE');
    try {
      createSchema(database);
      for (const [key, value] of [
        ['schema_version', '1'],
        ['deployment_id', identity.deployment_id],
        ['database_instance_id', identity.database_instance_id],
        ['signing_key_id', identity.signing_key_id],
      ] as const) {
        database.prepare('INSERT INTO schema_meta (key, value) VALUES (?, ?)').run(key, value);
      }
      database.exec('COMMIT');
    } catch (error) {
      if (database.isTransaction) {
        database.exec('ROLLBACK');
      }
      throw error;
    }
  } finally {
    database.close();
  }
}

export class WitnessStore {
  private readonly database: DatabaseSync;
  private readonly hooks: WitnessStoreHooks;

  public constructor(databasePath: string, identity: WitnessStoreIdentity, hooks: WitnessStoreHooks = {}) {
    validateStoreIdentity(identity);
    const beforeOpen = existingDatabaseStat(databasePath);
    let database: DatabaseSync;
    try {
      database = new DatabaseSync(databasePath, { timeout: 5000, enableForeignKeyConstraints: true });
    } catch {
      protocolError('PERSISTENCE_UNAVAILABLE', 'witness database could not be opened', 503);
    }
    let afterOpen: { dev: number; ino: number };
    try {
      afterOpen = existingDatabaseStat(databasePath);
    } catch (error) {
      database.close();
      throw error;
    }
    if (beforeOpen.dev !== afterOpen.dev || beforeOpen.ino !== afterOpen.ino) {
      database.close();
      protocolError('PERSISTENCE_REPLACED', 'witness database changed while opening', 503);
    }
    this.database = database;
    this.hooks = hooks;
    try {
      configureDatabase(this.database);
      this.verifyStoreIdentity(identity);
      this.verifyIntegrity();
    } catch (error) {
      this.database.close();
      throw error;
    }
  }

  public close(): void {
    this.database.close();
  }

  public createOrGetNamespaceRoot(namespace: string, frozenGenesisPayload: JsonObject): NamespaceRow {
    const genesisPayload = canonicalize(frozenGenesisPayload);
    const genesisPayloadDigest = sha256(genesisPayload);
    return this.transaction('root', () => {
      const existing = this.namespaceRow(namespace);
      if (existing !== undefined) {
        if (existing.genesis_payload !== genesisPayload || existing.genesis_digest !== this.genesisRecord(existing).record_digest) {
          protocolError('GENESIS_MISMATCH', 'existing namespace has a different frozen genesis payload', 409);
        }
        if (this.genesisPayloadDigest(existing) !== genesisPayloadDigest) {
          protocolError('GENESIS_MISMATCH', 'existing namespace has a different frozen genesis payload', 409);
        }
        return existing;
      }
      const includedAt = nowUtcSecond();
      const record = this.buildRecord(namespace, 0, 'GENESIS', frozenGenesisPayload, null, includedAt);
      const genesisId = genesisIdFor(namespace, genesisPayloadDigest, record.record_digest);
      this.database.prepare('INSERT INTO namespaces (namespace, genesis_id, genesis_digest, genesis_payload, head_sequence, head_record_digest, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
        namespace,
        genesisId,
        record.record_digest,
        genesisPayload,
        0,
        record.record_digest,
        includedAt,
      );
      this.insertRecord(record);
      return {
        namespace,
        genesis_id: genesisId,
        genesis_digest: record.record_digest,
        genesis_payload: genesisPayload,
        head_sequence: 0,
        head_record_digest: record.record_digest,
        created_at: includedAt,
      };
    });
  }

  public claimOnce(request: ClaimRequest): InternalClaimResult {
    const validated = validateClaimRequest({
      exact_window_object: request.exact_window_object,
      window_claim_key: request.window_claim_key,
      episode_binding: request.episode_binding,
      TERMINAL_CONTRACT_BINDING: request.terminal_contract_binding,
    });
    return this.transaction('claim', () => {
      const namespace = validated.exact_window_object.namespace;
      const root = this.namespaceRow(namespace);
      if (root === undefined) {
        protocolError('NAMESPACE_NOT_FOUND', 'namespace root does not exist', 404);
      }
      this.assertEpisodeBindingRoot(validated.episode_binding, root);
      const existingEpisode = this.database.prepare('SELECT namespace, episode_id, binding, state, claim_sequence FROM episodes WHERE namespace = ? AND episode_id = ?').get(namespace, validated.episode_binding.episode_id) as unknown as EpisodeRow | undefined;
      if (existingEpisode !== undefined) {
        protocolError('EPISODE_ALREADY_EXISTS', 'episode_id is already present in the namespace', 409);
      }
      const interval = intervalMillis(validated.exact_window_object);
      const intervals = this.database.prepare('SELECT namespace, window_claim_key, start_ms, end_ms, claim_sequence FROM intervals WHERE namespace = ? ORDER BY start_ms, end_ms, window_claim_key').all(namespace) as unknown as IntervalRow[];
      for (const prior of intervals) {
        if (Math.max(interval.start, prior.start_ms) < Math.min(interval.end, prior.end_ms)) {
          protocolError('WINDOW_OVERLAP', 'window overlaps a consumed interval', 409);
        }
      }
      const includedAt = nowUtcSecond();
      const payload = {
        exact_window_object: validated.exact_window_object,
        episode_binding: validated.episode_binding,
        TERMINAL_CONTRACT_BINDING: validated.terminal_contract_binding,
      } satisfies JsonObject;
      const record = this.buildRecord(namespace, root.head_sequence + 1, 'CLAIM', payload, root.head_record_digest, includedAt);
      this.insertRecord(record);
      this.database.prepare('INSERT INTO intervals (namespace, window_claim_key, start_ms, end_ms, claim_sequence) VALUES (?, ?, ?, ?, ?)').run(namespace, validated.window_claim_key, interval.start, interval.end, record.sequence);
      this.database.prepare('INSERT INTO episodes (namespace, episode_id, binding, state, claim_sequence) VALUES (?, ?, ?, ?, ?)').run(namespace, validated.episode_binding.episode_id, canonicalize(validated.episode_binding), 'CLAIM', record.sequence);
      this.updateHead(namespace, record);
      return { record, episode_binding: validated.episode_binding };
    });
  }

  public appendEvent(request: AppendEventRequest): InternalAppendResult {
    const validated = validateAppendEventRequest(request as unknown);
    return this.transaction('append', () => {
      const root = this.namespaceRow(validated.namespace);
      if (root === undefined) {
        protocolError('NAMESPACE_NOT_FOUND', 'namespace root does not exist', 404);
      }
      const episode = this.database.prepare('SELECT namespace, episode_id, binding, state, claim_sequence FROM episodes WHERE namespace = ? AND episode_id = ?').get(validated.namespace, validated.episode_binding.episode_id) as unknown as EpisodeRow | undefined;
      if (episode === undefined) {
        protocolError('EPISODE_NOT_FOUND', 'episode has no authoritative claim', 404);
      }
      const storedBinding = validateEpisodeBinding(parseStoredJson(episode.binding, 'episode binding'));
      if (canonicalize(storedBinding) !== canonicalize(validated.episode_binding)) {
        protocolError('EPISODE_BINDING_MISMATCH', 'event episode binding differs from the claim', 409);
      }
      this.assertEpisodeBindingRoot(storedBinding, root);
      const writerKey = publicKeyFromWire(storedBinding.writer_public_key);
      if (!verifyWriterEvent(writerKey, validated.namespace, validated.episode_binding as unknown as JsonObject, validated.event_type, validated.payload, validated.writer_signature)) {
        protocolError('INVALID_WRITER_SIGNATURE', 'writer signature is invalid', 401);
      }
      const nextState = nextEpisodeState(episode.state, validated.event_type);
      const includedAt = nowUtcSecond();
      const payload = {
        episode_binding: validated.episode_binding,
        event_payload: validated.payload,
        writer_signature: validated.writer_signature,
      } satisfies JsonObject;
      const record = this.buildRecord(validated.namespace, root.head_sequence + 1, validated.event_type, payload, root.head_record_digest, includedAt);
      this.insertRecord(record);
      this.database.prepare('UPDATE episodes SET state = ? WHERE namespace = ? AND episode_id = ?').run(nextState, validated.namespace, validated.episode_binding.episode_id);
      this.updateHead(validated.namespace, record);
      return { record };
    });
  }

  public namespace(namespace: string, namespaceGenesisId: string): NamespaceRow {
    const root = this.namespaceRow(namespace);
    if (root === undefined) {
      protocolError('NAMESPACE_NOT_FOUND', 'namespace root does not exist', 404);
    }
    if (root.genesis_id !== namespaceGenesisId) {
      protocolError('GENESIS_ID_MISMATCH', 'namespace genesis identity differs', 409);
    }
    return root;
  }

  public readEvent(namespace: string, namespaceGenesisId: string, sequence: number): WitnessRecord {
    const root = this.namespace(namespace, namespaceGenesisId);
    if (sequence > root.head_sequence) {
      protocolError('EVENT_NOT_FOUND', 'event sequence is not present', 404);
    }
    const row = this.database.prepare('SELECT namespace, sequence, record_type, payload_digest, previous_record_digest, record_digest, included_at, payload FROM records WHERE namespace = ? AND sequence = ?').get(namespace, sequence) as unknown as RecordRow | undefined;
    if (row === undefined) {
      protocolError('EVENT_NOT_FOUND', 'event sequence is not present', 404);
    }
    return this.rowToRecord(row);
  }

  public listEvents(namespace: string, namespaceGenesisId: string): WitnessRecord[] {
    this.namespace(namespace, namespaceGenesisId);
    const rows = this.database.prepare('SELECT namespace, sequence, record_type, payload_digest, previous_record_digest, record_digest, included_at, payload FROM records WHERE namespace = ? ORDER BY sequence ASC').all(namespace) as unknown as RecordRow[];
    return rows.map((row) => this.rowToRecord(row));
  }

  public allNamespaces(): NamespaceRow[] {
    return this.database.prepare('SELECT namespace, genesis_id, genesis_digest, genesis_payload, head_sequence, head_record_digest, created_at FROM namespaces ORDER BY namespace').all() as unknown as NamespaceRow[];
  }

  public verifyIntegrity(): void {
    const schemaVersion = this.database.prepare("SELECT value FROM schema_meta WHERE key = 'schema_version'").get() as unknown as { value: string } | undefined;
    if (schemaVersion?.value !== '1') {
      protocolError('SCHEMA_INCOMPATIBLE', 'witness schema version is incompatible', 503);
    }
    const namespaces = this.allNamespaces();
    for (const namespace of namespaces) {
      this.verifyNamespaceIntegrity(namespace);
    }
  }

  private verifyStoreIdentity(identity: WitnessStoreIdentity): void {
    let rows: Array<{ key: string; value: string }>;
    try {
      rows = this.database.prepare('SELECT key, value FROM schema_meta ORDER BY key').all() as unknown as Array<{ key: string; value: string }>;
    } catch {
      protocolError('STORE_IDENTITY_MISMATCH', 'witness database identity metadata is missing or malformed', 503);
    }
    if (rows.length !== STORE_METADATA_KEYS.length || rows.some((row, index) => row.key !== STORE_METADATA_KEYS[index])) {
      protocolError('STORE_IDENTITY_MISMATCH', 'witness database identity metadata is missing or malformed', 503);
    }
    const metadata = new Map(rows.map((row) => [row.key, row.value]));
    if (metadata.get('schema_version') !== '1' || metadata.get('deployment_id') !== identity.deployment_id || metadata.get('database_instance_id') !== identity.database_instance_id || metadata.get('signing_key_id') !== identity.signing_key_id) {
      protocolError('STORE_IDENTITY_MISMATCH', 'witness database identity does not match deployment or signing identity', 503);
    }
  }

  private verifyNamespaceIntegrity(namespace: NamespaceRow): void {
    const storedGenesisPayload = parseStoredJson(namespace.genesis_payload, 'namespace genesis payload');
    const records = this.database.prepare('SELECT namespace, sequence, record_type, payload_digest, previous_record_digest, record_digest, included_at, payload FROM records WHERE namespace = ? ORDER BY sequence ASC').all(namespace.namespace) as unknown as RecordRow[];
    if (records.length === 0) {
      protocolError('CORRUPT_PERSISTENCE', 'namespace has no records', 503);
    }
    const parsedRecords = records.map((row) => this.rowToRecord(row));
    const first = parsedRecords[0];
    if (first === undefined || first.sequence !== 0 || first.record_type !== 'GENESIS' || first.previous_record_digest !== null || canonicalize(first.payload) !== namespace.genesis_payload || first.payload_digest !== sha256(namespace.genesis_payload) || first.record_digest !== namespace.genesis_digest) {
      protocolError('CORRUPT_PERSISTENCE', 'namespace genesis linkage is invalid', 503);
    }
    const expectedGenesisId = genesisIdFor(namespace.namespace, first.payload_digest, first.record_digest);
    if (expectedGenesisId !== namespace.genesis_id || !isJsonObjectValue(storedGenesisPayload)) {
      protocolError('CORRUPT_PERSISTENCE', 'namespace genesis identity is invalid', 503);
    }
    let previous: string | null = null;
    for (const [index, record] of parsedRecords.entries()) {
      if (!verifyRecord(record, previous, index)) {
        protocolError('CORRUPT_PERSISTENCE', 'namespace hash chain is invalid', 503);
      }
      previous = record.record_digest;
    }
    const last = parsedRecords.at(-1);
    if (last === undefined || namespace.head_sequence !== last.sequence || namespace.head_record_digest !== last.record_digest) {
      protocolError('CORRUPT_PERSISTENCE', 'namespace head is invalid', 503);
    }
    this.verifyEpisodeAndIntervalTables(namespace, parsedRecords);
  }

  private verifyEpisodeAndIntervalTables(namespace: NamespaceRow, records: WitnessRecord[]): void {
    const expectedEpisodes = new Map<string, { binding: EpisodeBinding; state: string; claimSequence: number }>();
    const expectedIntervals = new Map<string, { start: number; end: number; sequence: number }>();
    for (const record of records) {
      if (record.record_type === 'GENESIS') {
        continue;
      }
      if (record.record_type === 'CLAIM') {
        requireExactKeys(record.payload, ['exact_window_object', 'episode_binding', 'TERMINAL_CONTRACT_BINDING'], 'stored claim payload');
        const binding = validateEpisodeBinding(record.payload.episode_binding);
        const window = validateWindow(record.payload.exact_window_object);
        const terminalBinding = validateTerminalContractBinding(record.payload.TERMINAL_CONTRACT_BINDING);
        const claimRequest = validateClaimRequest({ exact_window_object: window, window_claim_key: binding.window_claim_key, episode_binding: binding, TERMINAL_CONTRACT_BINDING: terminalBinding });
        if (window.namespace !== namespace.namespace || binding.namespace_genesis_id !== namespace.genesis_id || binding.namespace_genesis_digest !== namespace.genesis_digest) {
          protocolError('CORRUPT_PERSISTENCE', 'claim is detached from namespace genesis', 503);
        }
        if (expectedEpisodes.has(binding.episode_id) || expectedIntervals.has(binding.window_claim_key)) {
          protocolError('CORRUPT_PERSISTENCE', 'claim identity is duplicated', 503);
        }
        const interval = intervalMillis(claimRequest.exact_window_object);
        for (const prior of expectedIntervals.values()) {
          if (Math.max(interval.start, prior.start) < Math.min(interval.end, prior.end)) {
            protocolError('CORRUPT_PERSISTENCE', 'stored claim intervals overlap', 503);
          }
        }
        expectedEpisodes.set(binding.episode_id, { binding, state: 'CLAIM', claimSequence: record.sequence });
        expectedIntervals.set(binding.window_claim_key, { start: interval.start, end: interval.end, sequence: record.sequence });
        continue;
      }
      requireExactKeys(record.payload, ['episode_binding', 'event_payload', 'writer_signature'], 'stored event payload');
      const binding = validateEpisodeBinding(record.payload.episode_binding);
      const eventPayload = requireJsonObject(record.payload.event_payload, 'stored event payload.event_payload');
      const signature = requireString(record.payload.writer_signature, 'stored event payload.writer_signature');
      const episode = expectedEpisodes.get(binding.episode_id);
      if (episode === undefined || canonicalize(episode.binding) !== canonicalize(binding)) {
        protocolError('CORRUPT_PERSISTENCE', 'stored event has no matching claim binding', 503);
      }
      if (!verifyWriterEvent(publicKeyFromWire(binding.writer_public_key), namespace.namespace, binding as unknown as JsonObject, record.record_type, eventPayload, signature)) {
        protocolError('CORRUPT_PERSISTENCE', 'stored event writer signature is invalid', 503);
      }
      episode.state = nextEpisodeState(episode.state, record.record_type as Exclude<RecordType, 'GENESIS' | 'CLAIM'>);
    }
    const intervalRows = this.database.prepare('SELECT namespace, window_claim_key, start_ms, end_ms, claim_sequence FROM intervals WHERE namespace = ?').all(namespace.namespace) as unknown as IntervalRow[];
    if (intervalRows.length !== expectedIntervals.size) {
      protocolError('CORRUPT_PERSISTENCE', 'stored interval registry is incomplete', 503);
    }
    for (const row of intervalRows) {
      const expected = expectedIntervals.get(row.window_claim_key);
      if (expected === undefined || row.start_ms !== expected.start || row.end_ms !== expected.end || row.claim_sequence !== expected.sequence) {
        protocolError('CORRUPT_PERSISTENCE', 'stored interval registry is inconsistent', 503);
      }
    }
    const episodeRows = this.database.prepare('SELECT namespace, episode_id, binding, state, claim_sequence FROM episodes WHERE namespace = ?').all(namespace.namespace) as unknown as EpisodeRow[];
    if (episodeRows.length !== expectedEpisodes.size) {
      protocolError('CORRUPT_PERSISTENCE', 'stored episode registry is incomplete', 503);
    }
    for (const row of episodeRows) {
      const expected = expectedEpisodes.get(row.episode_id);
      if (expected === undefined || row.claim_sequence !== expected.claimSequence || row.state !== expected.state || canonicalize(validateEpisodeBinding(parseStoredJson(row.binding, 'stored episode binding'))) !== canonicalize(expected.binding)) {
        protocolError('CORRUPT_PERSISTENCE', 'stored episode registry is inconsistent', 503);
      }
    }
  }

  private rowToRecord(row: RecordRow): WitnessRecord {
    const payload = parseStoredJson(row.payload, 'record payload');
    const record = {
      namespace: row.namespace,
      sequence: row.sequence,
      record_type: row.record_type,
      payload_digest: row.payload_digest,
      previous_record_digest: row.previous_record_digest,
      record_digest: row.record_digest,
      included_at: row.included_at,
      payload,
    } as unknown;
    const object = requireJsonObject(record, 'stored record');
    const parsed = object as unknown as WitnessRecord;
    if (parsed.record_type === undefined || !isJsonObjectValue(parsed.payload)) {
      protocolError('CORRUPT_PERSISTENCE', 'stored record shape is invalid', 503);
    }
    try {
      return validateRecord(parsed);
    } catch (error) {
      if (error instanceof Error && error.name === 'WitnessProtocolError') {
        protocolError('CORRUPT_PERSISTENCE', 'stored record shape is invalid', 503);
      }
      throw error;
    }
  }

  private genesisRecord(namespace: NamespaceRow): WitnessRecord {
    const row = this.database.prepare('SELECT namespace, sequence, record_type, payload_digest, previous_record_digest, record_digest, included_at, payload FROM records WHERE namespace = ? AND sequence = 0').get(namespace.namespace) as unknown as RecordRow | undefined;
    if (row === undefined) {
      protocolError('CORRUPT_PERSISTENCE', 'namespace genesis record is missing', 503);
    }
    return this.rowToRecord(row);
  }

  private genesisPayloadDigest(namespace: NamespaceRow): string {
    return sha256(namespace.genesis_payload);
  }

  private namespaceRow(namespace: string): NamespaceRow | undefined {
    return this.database.prepare('SELECT namespace, genesis_id, genesis_digest, genesis_payload, head_sequence, head_record_digest, created_at FROM namespaces WHERE namespace = ?').get(namespace) as unknown as NamespaceRow | undefined;
  }

  private assertEpisodeBindingRoot(binding: EpisodeBinding, root: NamespaceRow): void {
    if (binding.namespace_genesis_id !== root.genesis_id || binding.namespace_genesis_digest !== root.genesis_digest) {
      protocolError('GENESIS_BINDING_MISMATCH', 'episode binding does not match namespace root', 409);
    }
  }

  private buildRecord(namespace: string, sequence: number, recordType: RecordType, payload: JsonObject, previousRecordDigest: string | null, includedAt: string): WitnessRecord {
    const payloadDigest = sha256(payload);
    const withoutDigest = {
      namespace,
      sequence,
      record_type: recordType,
      payload_digest: payloadDigest,
      previous_record_digest: previousRecordDigest,
      included_at: includedAt,
    };
    const recordDigest = computeRecordDigest(withoutDigest);
    return { ...withoutDigest, record_digest: recordDigest, payload };
  }

  private insertRecord(record: WitnessRecord): void {
    this.database.prepare('INSERT INTO records (namespace, sequence, record_type, payload_digest, previous_record_digest, record_digest, included_at, payload) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(
      record.namespace,
      record.sequence,
      record.record_type,
      record.payload_digest,
      record.previous_record_digest,
      record.record_digest,
      record.included_at,
      canonicalize(record.payload),
    );
  }

  private updateHead(namespace: string, record: WitnessRecord): void {
    this.database.prepare('UPDATE namespaces SET head_sequence = ?, head_record_digest = ? WHERE namespace = ?').run(record.sequence, record.record_digest, namespace);
  }

  private transaction<T>(operation: 'root' | 'claim' | 'append', callback: () => T): T {
    this.database.exec('BEGIN IMMEDIATE');
    try {
      const result = callback();
      this.hooks.beforeCommit?.(operation);
      this.database.exec('COMMIT');
      return result;
    } catch (error) {
      if (this.database.isTransaction) {
        this.database.exec('ROLLBACK');
      }
      throw error;
    }
  }
}

function validateStoreIdentity(identity: WitnessStoreIdentity): void {
  if (typeof identity.deployment_id !== 'string' || identity.deployment_id.length === 0 || typeof identity.database_instance_id !== 'string' || identity.database_instance_id.length === 0 || typeof identity.signing_key_id !== 'string' || identity.signing_key_id.length === 0) {
    protocolError('INVALID_STORE_IDENTITY', 'witness deployment, database, and signing identities are required', 503);
  }
}

function existingDatabaseStat(databasePath: string): { dev: number; ino: number } {
  let stats: ReturnType<typeof statSync>;
  try {
    stats = statSync(databasePath);
  } catch {
    protocolError('PERSISTENCE_UNAVAILABLE', 'witness database path does not exist', 503);
  }
  if (!stats.isFile() || stats.size === 0) {
    protocolError('PERSISTENCE_UNINITIALIZED', 'witness database path is empty or not a regular file', 503);
  }
  return { dev: stats.dev, ino: stats.ino };
}

function configureDatabase(database: DatabaseSync): void {
  database.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL; PRAGMA foreign_keys = ON;');
}

function createSchema(database: DatabaseSync): void {
  database.exec(`
    CREATE TABLE schema_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    ) STRICT;
    CREATE TABLE namespaces (
      namespace TEXT PRIMARY KEY,
      genesis_id TEXT NOT NULL UNIQUE,
      genesis_digest TEXT NOT NULL,
      genesis_payload TEXT NOT NULL,
      head_sequence INTEGER NOT NULL,
      head_record_digest TEXT NOT NULL,
      created_at TEXT NOT NULL
    ) STRICT;
    CREATE TABLE records (
      namespace TEXT NOT NULL,
      sequence INTEGER NOT NULL,
      record_type TEXT NOT NULL,
      payload_digest TEXT NOT NULL,
      previous_record_digest TEXT,
      record_digest TEXT NOT NULL,
      included_at TEXT NOT NULL,
      payload TEXT NOT NULL,
      PRIMARY KEY (namespace, sequence),
      UNIQUE (namespace, record_digest),
      FOREIGN KEY (namespace) REFERENCES namespaces(namespace)
    ) STRICT;
    CREATE TABLE intervals (
      namespace TEXT NOT NULL,
      window_claim_key TEXT NOT NULL,
      start_ms INTEGER NOT NULL,
      end_ms INTEGER NOT NULL,
      claim_sequence INTEGER NOT NULL,
      PRIMARY KEY (namespace, window_claim_key),
      UNIQUE (namespace, claim_sequence),
      FOREIGN KEY (namespace) REFERENCES namespaces(namespace)
    ) STRICT;
    CREATE TABLE episodes (
      namespace TEXT NOT NULL,
      episode_id TEXT NOT NULL,
      binding TEXT NOT NULL,
      state TEXT NOT NULL,
      claim_sequence INTEGER NOT NULL,
      PRIMARY KEY (namespace, episode_id),
      UNIQUE (namespace, claim_sequence),
      FOREIGN KEY (namespace) REFERENCES namespaces(namespace)
    ) STRICT;
  `);
}

function isJsonObjectValue(value: unknown): value is JsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function nextEpisodeState(currentState: string, eventType: Exclude<RecordType, 'GENESIS' | 'CLAIM'>): string {
  const transitions: Record<string, Record<string, string>> = {
    CLAIM: { CLAIM_ANCHORED: 'CLAIM_ANCHORED', TERMINAL_FAIL: 'TERMINAL_FAIL', TERMINAL_ABORT: 'TERMINAL_ABORT' },
    CLAIM_ANCHORED: { DATA_STARTED: 'DATA_STARTED', TERMINAL_FAIL: 'TERMINAL_FAIL', TERMINAL_ABORT: 'TERMINAL_ABORT' },
    DATA_STARTED: { CENSUS_CLOSED: 'CENSUS_CLOSED', TERMINAL_FAIL: 'TERMINAL_FAIL', TERMINAL_ABORT: 'TERMINAL_ABORT' },
    CENSUS_CLOSED: { SAMPLE_COMMITTED: 'SAMPLE_COMMITTED', TERMINAL_FAIL: 'TERMINAL_FAIL', TERMINAL_ABORT: 'TERMINAL_ABORT' },
    SAMPLE_COMMITTED: { TERMINAL_PASS: 'TERMINAL_PASS', TERMINAL_FAIL: 'TERMINAL_FAIL', TERMINAL_ABORT: 'TERMINAL_ABORT' },
  };
  const next = transitions[currentState]?.[eventType];
  if (next === undefined) {
    protocolError('ILLEGAL_STATE_TRANSITION', `event ${eventType} is invalid after ${currentState}`, 409);
  }
  return next;
}
