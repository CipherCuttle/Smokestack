export type JsonPrimitive = null | boolean | number | string;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };

export const WITNESS_PROTOCOL_ID = 'SMOKESTACK_PRODUCTION_WITNESS_V0';
export const WITNESS_SIGNING_ALGORITHM = 'Ed25519';
export const WITNESS_PUBLIC_KEY_FORMAT = 'base64url(SPKI_DER_NO_PADDING)';
export const WITNESS_KEY_ID_FORMAT = 'ed25519:sha256-spki:<lowercase-hex>';
export const WITNESS_SCHEMA_VERSION = '1';

export const RECORD_TYPES = [
  'GENESIS',
  'CLAIM',
  'CLAIM_ANCHORED',
  'DATA_STARTED',
  'CENSUS_CLOSED',
  'SAMPLE_COMMITTED',
  'TERMINAL_PASS',
  'TERMINAL_FAIL',
  'TERMINAL_ABORT',
] as const;
export type RecordType = (typeof RECORD_TYPES)[number];
export type EpisodeEventType = Exclude<RecordType, 'GENESIS' | 'CLAIM'>;

export const TERMINAL_EVENT_TYPES = ['TERMINAL_PASS', 'TERMINAL_FAIL', 'TERMINAL_ABORT'] as const;

export interface ExactWindowObject {
  [key: string]: JsonValue;
  namespace: string;
  window_start: string;
  window_end: string;
}

export interface TerminalContractBinding {
  [key: string]: JsonValue;
  prereg_contract_id: string;
  prereg_terminal_commit: string;
  prereg_json_sha256: string;
  prereg_terminal_state: string;
  execution_authorization_contract_id: string;
  execution_authorization_terminal_commit: string;
  execution_authorization_json_sha256: string;
}

export interface EpisodeBinding {
  [key: string]: JsonValue;
  namespace_genesis_id: string;
  namespace_genesis_digest: string;
  episode_id: string;
  window_claim_key: string;
  initial_claim_digest: string;
  writer_public_key: string;
}

export interface WitnessRecord {
  [key: string]: JsonValue;
  namespace: string;
  sequence: number;
  record_type: RecordType;
  payload_digest: string;
  previous_record_digest: string | null;
  record_digest: string;
  included_at: string;
  payload: JsonObject;
}

export interface CheckpointBody {
  [key: string]: JsonValue;
  checkpoint_type: 'WITNESS_CHECKPOINT_V0';
  namespace: string;
  genesis_digest: string;
  head_sequence: number;
  head_record_digest: string;
  checkpoint_time: string;
  key_id: string;
}

export interface WitnessCheckpoint extends CheckpointBody {
  checkpoint_digest: string;
  signature: string;
}

export interface ReceiptBody {
  [key: string]: JsonValue;
  receipt_type: 'WITNESS_RECEIPT_V0';
  namespace: string;
  sequence: number;
  record_digest: string;
  included_at: string;
  checkpoint_digest: string;
  key_id: string;
}

export interface WitnessReceipt extends ReceiptBody {
  checkpoint: WitnessCheckpoint;
  receipt_digest: string;
  signature: string;
}

export interface NamespaceRootResult {
  namespace_genesis_id: string;
  namespace_genesis_digest: string;
  namespace_genesis_receipt: WitnessReceipt;
  namespace_genesis_checkpoint: WitnessCheckpoint;
}

export interface ClaimResult {
  record: WitnessRecord;
  receipt: WitnessReceipt;
  checkpoint: WitnessCheckpoint;
  episode_binding: EpisodeBinding;
}

export interface AppendResult {
  record: WitnessRecord;
  receipt: WitnessReceipt;
  checkpoint: WitnessCheckpoint;
}

export interface ListResult {
  namespace: string;
  namespace_genesis_id: string;
  records: WitnessRecord[];
  checkpoint: WitnessCheckpoint;
}

export interface ReadResult {
  record: WitnessRecord;
  receipt: WitnessReceipt;
  checkpoint: WitnessCheckpoint;
}

export interface VerifyInclusionResult {
  valid: boolean;
  reason: string;
}

export interface VerifyConsistencyResult {
  valid: boolean;
  reason: string;
}
