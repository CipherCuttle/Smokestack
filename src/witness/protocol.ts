import { canonicalize, requireDigest, requireExactKeys, requireJsonObject, requireString, sha256, validateExactUtcSecond, timestampToMillis } from './canonical.js';
import { protocolError } from './errors.js';
import { publicKeyFromWire } from './crypto.js';
import { RECORD_TYPES, type EpisodeBinding, type EpisodeEventType, type ExactWindowObject, type JsonObject, type JsonValue, type TerminalContractBinding, type WitnessCheckpoint, type WitnessRecord } from './types.js';

const TERMINAL_BINDING_KEYS = [
  'prereg_contract_id',
  'prereg_terminal_commit',
  'prereg_json_sha256',
  'prereg_terminal_state',
  'execution_authorization_contract_id',
  'execution_authorization_terminal_commit',
  'execution_authorization_json_sha256',
] as const;
const EPISODE_BINDING_KEYS = [
  'namespace_genesis_id',
  'namespace_genesis_digest',
  'episode_id',
  'window_claim_key',
  'initial_claim_digest',
  'writer_public_key',
] as const;
const WINDOW_KEYS = ['namespace', 'window_start', 'window_end'] as const;
const CHECKPOINT_KEYS = [
  'checkpoint_type',
  'namespace',
  'genesis_digest',
  'head_sequence',
  'head_record_digest',
  'checkpoint_time',
  'key_id',
  'checkpoint_digest',
  'signature',
] as const;
const RECORD_KEYS = [
  'namespace',
  'sequence',
  'record_type',
  'payload_digest',
  'previous_record_digest',
  'record_digest',
  'included_at',
  'payload',
] as const;

export interface ClaimRequest {
  exact_window_object: ExactWindowObject;
  window_claim_key: string;
  episode_binding: EpisodeBinding;
  terminal_contract_binding: TerminalContractBinding;
}

export interface AppendEventRequest {
  namespace: string;
  episode_binding: EpisodeBinding;
  event_type: EpisodeEventType;
  payload: JsonObject;
  writer_signature: string;
}

export function parseJsonBody(body: string): unknown {
  let value: unknown;
  try {
    value = JSON.parse(body) as unknown;
  } catch {
    protocolError('INVALID_JSON', 'request body must be valid JSON');
  }
  return value;
}

export function validateRootRequest(value: unknown): { namespace: string; frozenGenesisPayload: JsonObject } {
  const object = requireJsonObject(value, 'root request');
  requireExactKeys(object, ['namespace', 'frozen_genesis_payload'], 'root request');
  return {
    namespace: requireString(object.namespace, 'namespace'),
    frozenGenesisPayload: requireJsonObject(object.frozen_genesis_payload, 'frozen_genesis_payload'),
  };
}

export function validateNamespaceIdentity(value: unknown, name: string): { namespace: string; namespaceGenesisId: string } {
  const object = requireJsonObject(value, name);
  requireExactKeys(object, ['namespace', 'namespace_genesis_id'], name);
  return {
    namespace: requireString(object.namespace, `${name}.namespace`),
    namespaceGenesisId: requireString(object.namespace_genesis_id, `${name}.namespace_genesis_id`),
  };
}

export function validateReadRequest(value: unknown): { namespace: string; namespaceGenesisId: string; sequence: number } {
  const object = requireJsonObject(value, 'read request');
  requireExactKeys(object, ['namespace', 'namespace_genesis_id', 'sequence'], 'read request');
  const sequence = object.sequence;
  if (typeof sequence !== 'number' || !Number.isSafeInteger(sequence) || sequence < 0) {
    protocolError('INVALID_SEQUENCE', 'sequence must be a non-negative safe integer');
  }
  const identity = validateNamespaceIdentity({ namespace: object.namespace, namespace_genesis_id: object.namespace_genesis_id }, 'read request identity');
  return { ...identity, sequence };
}

export function validateClaimRequest(value: unknown): ClaimRequest {
  const object = requireJsonObject(value, 'claim request');
  requireExactKeys(object, ['exact_window_object', 'window_claim_key', 'episode_binding', 'TERMINAL_CONTRACT_BINDING'], 'claim request');
  const window = validateWindow(object.exact_window_object);
  const windowClaimKey = requireDigest(object.window_claim_key, 'window_claim_key');
  const episodeBinding = validateEpisodeBinding(object.episode_binding);
  const terminalBinding = validateTerminalContractBinding(object.TERMINAL_CONTRACT_BINDING);
  const initialClaimDigest = sha256(terminalBinding);
  if (episodeBinding.initial_claim_digest !== initialClaimDigest) {
    protocolError('INITIAL_CLAIM_DIGEST_MISMATCH', 'initial_claim_digest does not cover the complete terminal contract binding');
  }
  const canonicalWindow = canonicalize(window);
  const recomputedWindowClaimKey = sha256(canonicalWindow);
  if (windowClaimKey !== recomputedWindowClaimKey) {
    protocolError('WINDOW_CLAIM_KEY_MISMATCH', 'window_claim_key does not match the exact window object');
  }
  return {
    exact_window_object: window,
    window_claim_key: windowClaimKey,
    episode_binding: episodeBinding,
    terminal_contract_binding: terminalBinding,
  };
}

export function validateWindow(value: unknown): ExactWindowObject {
  const object = requireJsonObject(value, 'exact_window_object');
  requireExactKeys(object, WINDOW_KEYS, 'exact_window_object');
  const namespace = requireString(object.namespace, 'exact_window_object.namespace');
  const windowStart = validateExactUtcSecond(object.window_start, 'exact_window_object.window_start');
  const windowEnd = validateExactUtcSecond(object.window_end, 'exact_window_object.window_end');
  if (timestampToMillis(windowStart) >= timestampToMillis(windowEnd)) {
    protocolError('INVALID_INTERVAL', 'window_start must be earlier than window_end');
  }
  return { namespace, window_start: windowStart, window_end: windowEnd };
}

export function validateTerminalContractBinding(value: unknown): TerminalContractBinding {
  const object = requireJsonObject(value, 'TERMINAL_CONTRACT_BINDING');
  requireExactKeys(object, TERMINAL_BINDING_KEYS, 'TERMINAL_CONTRACT_BINDING');
  const binding = {} as TerminalContractBinding;
  for (const key of TERMINAL_BINDING_KEYS) {
    binding[key] = requireString(object[key], `TERMINAL_CONTRACT_BINDING.${key}`);
  }
  return binding;
}

export function validateEpisodeBinding(value: unknown): EpisodeBinding {
  const object = requireJsonObject(value, 'episode_binding');
  requireExactKeys(object, EPISODE_BINDING_KEYS, 'episode_binding');
  const binding = {
    namespace_genesis_id: requireString(object.namespace_genesis_id, 'episode_binding.namespace_genesis_id'),
    namespace_genesis_digest: requireDigest(object.namespace_genesis_digest, 'episode_binding.namespace_genesis_digest'),
    episode_id: requireString(object.episode_id, 'episode_binding.episode_id'),
    window_claim_key: requireDigest(object.window_claim_key, 'episode_binding.window_claim_key'),
    initial_claim_digest: requireDigest(object.initial_claim_digest, 'episode_binding.initial_claim_digest'),
    writer_public_key: requireString(object.writer_public_key, 'episode_binding.writer_public_key'),
  } satisfies EpisodeBinding;
  publicKeyFromWire(binding.writer_public_key);
  return binding;
}

export function validateAppendEventRequest(value: unknown): AppendEventRequest {
  const object = requireJsonObject(value, 'append event request');
  requireExactKeys(object, ['namespace', 'episode_binding', 'event_type', 'payload', 'writer_signature'], 'append event request');
  const eventType = requireString(object.event_type, 'event_type');
  if (!RECORD_TYPES.includes(eventType as (typeof RECORD_TYPES)[number]) || eventType === 'GENESIS' || eventType === 'CLAIM') {
    protocolError('INVALID_EVENT_TYPE', 'event_type is not a legal post-claim event');
  }
  return {
    namespace: requireString(object.namespace, 'namespace'),
    episode_binding: validateEpisodeBinding(object.episode_binding),
    event_type: eventType as EpisodeEventType,
    payload: requireJsonObject(object.payload, 'payload'),
    writer_signature: requireString(object.writer_signature, 'writer_signature'),
  };
}

export function validateCheckpoint(value: unknown): WitnessCheckpoint {
  const object = requireJsonObject(value, 'checkpoint');
  requireExactKeys(object, CHECKPOINT_KEYS, 'checkpoint');
  const sequence = object.head_sequence;
  if (typeof sequence !== 'number' || !Number.isSafeInteger(sequence) || sequence < 0) {
    protocolError('INVALID_CHECKPOINT', 'checkpoint head_sequence is invalid');
  }
  const checkpointType = object.checkpoint_type;
  if (checkpointType !== 'WITNESS_CHECKPOINT_V0') {
    protocolError('INVALID_CHECKPOINT', 'checkpoint type is invalid');
  }
  return {
    checkpoint_type: checkpointType,
    namespace: requireString(object.namespace, 'checkpoint.namespace'),
    genesis_digest: requireDigest(object.genesis_digest, 'checkpoint.genesis_digest'),
    head_sequence: sequence,
    head_record_digest: requireDigest(object.head_record_digest, 'checkpoint.head_record_digest'),
    checkpoint_time: validateExactUtcSecond(object.checkpoint_time, 'checkpoint.checkpoint_time'),
    key_id: requireString(object.key_id, 'checkpoint.key_id'),
    checkpoint_digest: requireDigest(object.checkpoint_digest, 'checkpoint.checkpoint_digest'),
    signature: requireString(object.signature, 'checkpoint.signature'),
  };
}

export function validateRecord(value: unknown): WitnessRecord {
  const object = requireJsonObject(value, 'record');
  requireExactKeys(object, RECORD_KEYS, 'record');
  const sequence = object.sequence;
  if (typeof sequence !== 'number' || !Number.isSafeInteger(sequence) || sequence < 0) {
    protocolError('INVALID_RECORD', 'record sequence is invalid');
  }
  const recordType = requireString(object.record_type, 'record.record_type');
  if (!RECORD_TYPES.includes(recordType as (typeof RECORD_TYPES)[number])) {
    protocolError('INVALID_RECORD', 'record type is invalid');
  }
  const previous = object.previous_record_digest;
  if (previous !== null && typeof previous !== 'string') {
    protocolError('INVALID_RECORD', 'previous_record_digest must be null or lowercase SHA-256 hex');
  }
  if (typeof previous === 'string') {
    requireDigest(previous, 'record.previous_record_digest');
  }
  return {
    namespace: requireString(object.namespace, 'record.namespace'),
    sequence,
    record_type: recordType as WitnessRecord['record_type'],
    payload_digest: requireDigest(object.payload_digest, 'record.payload_digest'),
    previous_record_digest: previous,
    record_digest: requireDigest(object.record_digest, 'record.record_digest'),
    included_at: validateExactUtcSecond(object.included_at, 'record.included_at'),
    payload: requireJsonObject(object.payload, 'record.payload'),
  };
}

export function canonicalEpisodeBinding(binding: EpisodeBinding): string {
  return canonicalize(binding as unknown as JsonValue);
}

export function intervalMillis(window: ExactWindowObject): { start: number; end: number } {
  return { start: timestampToMillis(window.window_start), end: timestampToMillis(window.window_end) };
}
