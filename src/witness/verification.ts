import { type KeyObject } from 'node:crypto';
import { canonicalize, sha256 } from './canonical.js';
import { verifyCheckpoint, publicKeyFromWire, verifyReceipt } from './crypto.js';
import { validateRecord } from './protocol.js';
import type { JsonObject, WitnessCheckpoint, WitnessRecord, WitnessReceipt, VerifyConsistencyResult, VerifyInclusionResult } from './types.js';

interface ImmutableRecordFields {
  namespace: string;
  sequence: number;
  record_type: WitnessRecord['record_type'];
  payload_digest: string;
  previous_record_digest: string | null;
  included_at: string;
}

function recordBody(record: ImmutableRecordFields): JsonObject {
  return {
    namespace: record.namespace,
    sequence: record.sequence,
    record_type: record.record_type,
    payload_digest: record.payload_digest,
    previous_record_digest: record.previous_record_digest,
    included_at: record.included_at,
  };
}

export function computeRecordDigest(record: ImmutableRecordFields): string {
  return sha256(recordBody(record));
}

export function verifyRecord(record: WitnessRecord, expectedPrevious: string | null, expectedSequence: number): boolean {
  try {
    const validated = validateRecord(record);
    if (validated.sequence !== expectedSequence || validated.previous_record_digest !== expectedPrevious) {
      return false;
    }
    const payloadDigest = sha256(validated.payload);
    if (payloadDigest !== validated.payload_digest) {
      return false;
    }
    return computeRecordDigest(validated) === validated.record_digest;
  } catch {
    return false;
  }
}

export function verifyHistory(publicKey: KeyObject, checkpoint: WitnessCheckpoint, records: WitnessRecord[]): VerifyInclusionResult {
  if (!verifyCheckpoint(publicKey, checkpoint)) {
    return { valid: false, reason: 'checkpoint signature or digest invalid' };
  }
  if (records.length === 0) {
    return { valid: false, reason: 'history is empty' };
  }
  if (records[0]?.sequence !== 0 || records[0]?.record_type !== 'GENESIS' || records[0]?.previous_record_digest !== null) {
    return { valid: false, reason: 'history does not begin with authenticated genesis' };
  }
  let previous: string | null = null;
  for (const [index, record] of records.entries()) {
    if (!verifyRecord(record, previous, index)) {
      return { valid: false, reason: `record ${index} failed chain verification` };
    }
    if (record.namespace !== checkpoint.namespace) {
      return { valid: false, reason: 'record namespace differs from checkpoint' };
    }
    previous = record.record_digest;
  }
  const head = records.at(-1);
  if (head === undefined || head.sequence !== checkpoint.head_sequence || head.record_digest !== checkpoint.head_record_digest) {
    return { valid: false, reason: 'checkpoint head does not match supplied history' };
  }
  if (records[0]?.record_digest !== checkpoint.genesis_digest) {
    return { valid: false, reason: 'checkpoint genesis differs from supplied history' };
  }
  return { valid: true, reason: 'authenticated contiguous history' };
}

export function verifyInclusion(publicKey: KeyObject | string, checkpoint: WitnessCheckpoint, records: WitnessRecord[], targetSequence: number): VerifyInclusionResult {
  let key: KeyObject;
  try {
    key = typeof publicKey === 'string' ? publicKeyFromWire(publicKey) : publicKey;
  } catch {
    return { valid: false, reason: 'witness public key is invalid' };
  }
  if (!Number.isInteger(targetSequence) || targetSequence < 0) {
    return { valid: false, reason: 'target sequence is invalid' };
  }
  const historyResult = verifyHistory(key, checkpoint, records);
  if (!historyResult.valid) {
    return historyResult;
  }
  const target = records[targetSequence];
  return target === undefined ? { valid: false, reason: 'target record is absent from authenticated history' } : { valid: true, reason: 'record is included in authenticated history' };
}

export function verifyConsistency(publicKey: KeyObject | string, oldCheckpoint: WitnessCheckpoint, newCheckpoint: WitnessCheckpoint, newRecords: WitnessRecord[]): VerifyConsistencyResult {
  let key: KeyObject;
  try {
    key = typeof publicKey === 'string' ? publicKeyFromWire(publicKey) : publicKey;
  } catch {
    return { valid: false, reason: 'witness public key is invalid' };
  }
  if (!verifyCheckpoint(key, oldCheckpoint) || !verifyCheckpoint(key, newCheckpoint)) {
    return { valid: false, reason: 'checkpoint signature or digest invalid' };
  }
  if (oldCheckpoint.namespace !== newCheckpoint.namespace || oldCheckpoint.genesis_digest !== newCheckpoint.genesis_digest || oldCheckpoint.key_id !== newCheckpoint.key_id) {
    return { valid: false, reason: 'namespace or genesis changed' };
  }
  if (newCheckpoint.head_sequence < oldCheckpoint.head_sequence) {
    return { valid: false, reason: 'new checkpoint moved backward' };
  }
  const newHistory = verifyHistory(key, newCheckpoint, newRecords);
  if (!newHistory.valid) {
    return newHistory;
  }
  const oldHead = newRecords[oldCheckpoint.head_sequence];
  if (oldHead === undefined || oldHead.record_digest !== oldCheckpoint.head_record_digest) {
    return { valid: false, reason: 'old checkpoint prefix is not present byte-for-byte' };
  }
  for (let index = 0; index <= oldCheckpoint.head_sequence; index += 1) {
    const record = newRecords[index];
    if (record === undefined || !verifyRecord(record, index === 0 ? null : newRecords[index - 1]?.record_digest ?? null, index)) {
      return { valid: false, reason: 'historical prefix is not contiguous' };
    }
  }
  return { valid: true, reason: 'new checkpoint is an append-only extension' };
}

export function verifyReceiptAndInclusion(publicKey: KeyObject | string, receipt: WitnessReceipt, records: WitnessRecord[]): VerifyInclusionResult {
  let key: KeyObject;
  try {
    key = typeof publicKey === 'string' ? publicKeyFromWire(publicKey) : publicKey;
  } catch {
    return { valid: false, reason: 'witness public key is invalid' };
  }
  if (!verifyReceipt(key, receipt)) {
    return { valid: false, reason: 'receipt signature or digest invalid' };
  }
  return verifyInclusion(key, receipt.checkpoint, records, receipt.sequence);
}

export function recordImmutableCanonicalBytes(record: WitnessRecord): Buffer {
  return Buffer.from(canonicalize({
    namespace: record.namespace,
    sequence: record.sequence,
    record_type: record.record_type,
    payload_digest: record.payload_digest,
    previous_record_digest: record.previous_record_digest,
    included_at: record.included_at,
  }), 'utf8');
}
