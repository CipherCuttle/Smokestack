import {
  createPrivateKey,
  createPublicKey,
  createHash,
  sign,
  verify,
  type KeyObject,
} from 'node:crypto';
import { protocolError } from './errors.js';
import { canonicalUtf8, sha256 } from './canonical.js';
import type { CheckpointBody, JsonObject, ReceiptBody, WitnessCheckpoint, WitnessReceipt } from './types.js';

const BASE64URL = /^[A-Za-z0-9_-]+$/;

export function encodeBase64Url(bytes: Buffer): string {
  return bytes.toString('base64').replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '');
}

export function decodeBase64Url(value: string, name: string): Buffer {
  if (value.length === 0 || !BASE64URL.test(value) || value.length % 4 === 1) {
    protocolError('INVALID_ENCODING', `${name} must be unpadded base64url`);
  }
  const padded = value.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - (value.length % 4)) % 4);
  const decoded = Buffer.from(padded, 'base64');
  if (encodeBase64Url(decoded) !== value) {
    protocolError('INVALID_ENCODING', `${name} is not canonical base64url`);
  }
  return decoded;
}

export function loadEd25519PrivateKey(pem: string): KeyObject {
  const key = createPrivateKey(pem);
  if (key.asymmetricKeyType !== 'ed25519') {
    protocolError('INVALID_SIGNING_KEY', 'witness signing key must be Ed25519', 503);
  }
  return key;
}

export function publicKeyFromWire(value: string): KeyObject {
  const der = decodeBase64Url(value, 'writer_public_key');
  let key: KeyObject;
  try {
    key = createPublicKey({ key: der, format: 'der', type: 'spki' });
  } catch {
    protocolError('INVALID_PUBLIC_KEY', 'writer_public_key is not a valid SPKI key');
  }
  if (key.asymmetricKeyType !== 'ed25519') {
    protocolError('INVALID_PUBLIC_KEY', 'writer_public_key must be Ed25519');
  }
  const canonical = encodeBase64Url(key.export({ format: 'der', type: 'spki' }));
  if (canonical !== value) {
    protocolError('INVALID_PUBLIC_KEY', 'writer_public_key is not canonical SPKI encoding');
  }
  return key;
}

export function publicKeyToWire(key: KeyObject): string {
  if (key.asymmetricKeyType !== 'ed25519') {
    protocolError('INVALID_PUBLIC_KEY', 'public key must be Ed25519');
  }
  return encodeBase64Url(key.export({ format: 'der', type: 'spki' }));
}

export function keyIdForPublicKey(key: KeyObject): string {
  const der = key.export({ format: 'der', type: 'spki' });
  return `ed25519:sha256-spki:${createHash('sha256').update(der).digest('hex')}`;
}

export function signBytes(privateKey: KeyObject, bytes: Buffer): string {
  return encodeBase64Url(sign(null, bytes, privateKey));
}

export function verifyBytes(publicKey: KeyObject, bytes: Buffer, signature: string, name: string): boolean {
  const signatureBytes = decodeBase64Url(signature, name);
  if (signatureBytes.length !== 64) {
    protocolError('INVALID_SIGNATURE', `${name} must be an Ed25519 signature`);
  }
  return verify(null, bytes, publicKey, signatureBytes);
}

export function checkpointBody(checkpoint: WitnessCheckpoint | CheckpointBody): CheckpointBody {
  return {
    checkpoint_type: checkpoint.checkpoint_type,
    namespace: checkpoint.namespace,
    genesis_digest: checkpoint.genesis_digest,
    head_sequence: checkpoint.head_sequence,
    head_record_digest: checkpoint.head_record_digest,
    checkpoint_time: checkpoint.checkpoint_time,
    key_id: checkpoint.key_id,
  };
}

export function signCheckpoint(privateKey: KeyObject, body: CheckpointBody): WitnessCheckpoint {
  const checkpointDigest = sha256(checkpointBody(body) as unknown as JsonObject);
  return {
    ...body,
    checkpoint_digest: checkpointDigest,
    signature: signBytes(privateKey, Buffer.from(checkpointDigest, 'utf8')),
  };
}

export function receiptBody(receipt: WitnessReceipt | ReceiptBody): ReceiptBody {
  return {
    receipt_type: receipt.receipt_type,
    namespace: receipt.namespace,
    sequence: receipt.sequence,
    record_digest: receipt.record_digest,
    included_at: receipt.included_at,
    checkpoint_digest: receipt.checkpoint_digest,
    key_id: receipt.key_id,
  };
}

export function signReceipt(privateKey: KeyObject, body: ReceiptBody, checkpoint: WitnessCheckpoint): WitnessReceipt {
  const receiptDigest = sha256(receiptBody(body) as unknown as JsonObject);
  return {
    ...body,
    checkpoint,
    receipt_digest: receiptDigest,
    signature: signBytes(privateKey, Buffer.from(receiptDigest, 'utf8')),
  };
}

export function verifyCheckpoint(publicKey: KeyObject, checkpoint: WitnessCheckpoint): boolean {
  try {
    if (keyIdForPublicKey(publicKey) !== checkpoint.key_id) {
      return false;
    }
    const digest = sha256(checkpointBody(checkpoint) as unknown as JsonObject);
    return digest === checkpoint.checkpoint_digest && verifyBytes(publicKey, Buffer.from(digest, 'utf8'), checkpoint.signature, 'checkpoint.signature');
  } catch {
    return false;
  }
}

export function verifyReceipt(publicKey: KeyObject, receipt: WitnessReceipt): boolean {
  try {
    if (!verifyCheckpoint(publicKey, receipt.checkpoint)) {
      return false;
    }
    if (receipt.namespace !== receipt.checkpoint.namespace || receipt.key_id !== receipt.checkpoint.key_id || receipt.included_at !== receipt.checkpoint.checkpoint_time || receipt.sequence !== receipt.checkpoint.head_sequence || receipt.record_digest !== receipt.checkpoint.head_record_digest || receipt.checkpoint_digest !== receipt.checkpoint.checkpoint_digest) {
      return false;
    }
    const digest = sha256(receiptBody(receipt) as unknown as JsonObject);
    return digest === receipt.receipt_digest && verifyBytes(publicKey, Buffer.from(digest, 'utf8'), receipt.signature, 'receipt.signature');
  } catch {
    return false;
  }
}

export function writerEventPreimage(namespace: string, episodeBinding: JsonObject, eventType: string, payload: JsonObject): Buffer {
  return canonicalUtf8({ namespace, episode_binding: episodeBinding, event_type: eventType, payload });
}

export function signWriterEvent(privateKey: KeyObject, namespace: string, episodeBinding: JsonObject, eventType: string, payload: JsonObject): string {
  return signBytes(privateKey, writerEventPreimage(namespace, episodeBinding, eventType, payload));
}

export function verifyWriterEvent(publicKey: KeyObject, namespace: string, episodeBinding: JsonObject, eventType: string, payload: JsonObject, signature: string): boolean {
  try {
    return verifyBytes(publicKey, writerEventPreimage(namespace, episodeBinding, eventType, payload), signature, 'writer_signature');
  } catch {
    return false;
  }
}

export function privateKeyFromPem(pem: string): KeyObject {
  return loadEd25519PrivateKey(pem);
}

export function publicKeyFromPrivate(privateKey: KeyObject): string {
  return publicKeyToWire(createPublicKey(privateKey));
}

export function digestCanonicalObject(value: JsonObject): string {
  return sha256(canonicalUtf8(value));
}
