import { createHash } from 'node:crypto';
import { protocolError } from './errors.js';
import type { JsonObject, JsonValue } from './types.js';

const HEX_64 = /^[0-9a-f]{64}$/;
const EXACT_UTC_SECOND = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})Z$/;

export function isJsonObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function requireJsonObject(value: unknown, name: string): JsonObject {
  if (!isJsonObject(value)) {
    protocolError('INVALID_OBJECT', `${name} must be a JSON object`);
  }
  return value;
}

export function requireExactKeys(value: JsonObject, expected: readonly string[], name: string): void {
  const actual = Object.keys(value).sort();
  const required = [...expected].sort();
  if (actual.length !== required.length || actual.some((key, index) => key !== required[index])) {
    protocolError('INVALID_MEMBERS', `${name} must contain exactly the required members`);
  }
}

export function requireString(value: JsonValue | undefined, name: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    protocolError('INVALID_STRING', `${name} must be a non-empty string`);
  }
  return value;
}

export function requireDigest(value: JsonValue | undefined, name: string): string {
  const digest = requireString(value, name);
  if (!HEX_64.test(digest)) {
    protocolError('INVALID_DIGEST', `${name} must be lowercase SHA-256 hex`);
  }
  return digest;
}

export function canonicalize(value: JsonValue): string {
  return canonicalizeValue(value);
}

function canonicalizeValue(value: JsonValue): string {
  if (value === null) {
    return 'null';
  }
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }
  if (typeof value === 'string') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      protocolError('INVALID_JSON_NUMBER', 'JSON numbers must be finite');
    }
    if (Object.is(value, -0)) {
      return '0';
    }
    const encoded = JSON.stringify(value);
    if (encoded === undefined) {
      protocolError('INVALID_JSON_NUMBER', 'JSON number serialization failed');
    }
    return encoded;
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalizeValue(item)).join(',')}]`;
  }
  const keys = Object.keys(value).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalizeValue(value[key] as JsonValue)}`).join(',')}}`;
}

export function canonicalUtf8(value: JsonValue): Buffer {
  return Buffer.from(canonicalize(value), 'utf8');
}

export function sha256(value: JsonValue | Buffer | string): string {
  const bytes = Buffer.isBuffer(value) ? value : typeof value === 'string' ? Buffer.from(value, 'utf8') : canonicalUtf8(value);
  return createHash('sha256').update(bytes).digest('hex');
}

export function validateExactUtcSecond(value: JsonValue | undefined, name: string): string {
  const timestamp = requireString(value, name);
  const match = EXACT_UTC_SECOND.exec(timestamp);
  if (match === null) {
    protocolError('INVALID_TIMESTAMP', `${name} must use YYYY-MM-DDTHH:MM:SSZ`);
  }
  const parsed = Date.parse(timestamp);
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString().slice(0, 19) + 'Z' !== timestamp) {
    protocolError('INVALID_TIMESTAMP', `${name} is not a valid UTC timestamp`);
  }
  return timestamp;
}

export function timestampToMillis(timestamp: string): number {
  const parsed = Date.parse(timestamp);
  if (!Number.isFinite(parsed)) {
    protocolError('INVALID_TIMESTAMP', 'timestamp is not parseable');
  }
  return parsed;
}

export function nowUtcSecond(): string {
  return new Date().toISOString().slice(0, 19) + 'Z';
}

export function assertLowerHexDigest(value: string, name: string): void {
  if (!HEX_64.test(value)) {
    protocolError('INVALID_DIGEST', `${name} must be lowercase SHA-256 hex`);
  }
}

export function parseStoredJson(value: string, name: string): JsonValue {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value) as unknown;
  } catch {
    protocolError('CORRUPT_PERSISTENCE', `${name} is not valid JSON`, 503);
  }
  if (parsed === undefined) {
    protocolError('CORRUPT_PERSISTENCE', `${name} is undefined`, 503);
  }
  const canonical = canonicalize(parsed as JsonValue);
  if (canonical !== value) {
    protocolError('CORRUPT_PERSISTENCE', `${name} is not canonical JSON`, 503);
  }
  return parsed as JsonValue;
}
