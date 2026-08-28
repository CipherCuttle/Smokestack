# ADR-0007: Bounded PR-01 Production Witness V0

Status: ACCEPTED for `PR01_PRODUCTION_WITNESS_IMPLEMENTATION_V0`

## Context

V5 freezes an externally witnessed, globally interval-aware claim and an
append-only lineage, but the earlier execution-authorization phase stopped
fail-closed because no real witness existed. This phase needs an executable
candidate that can be qualified without creating or touching a production
namespace.

## Decision

Implement a small Node/TypeScript network service under `src/witness/` with a
separate process boundary and a service-owned SQLite database. SQLite is an
internal V0 persistence detail only; clients interact through the HTTP API and
never receive a database handle. `BEGIN IMMEDIATE`, WAL mode, full
synchronous durability, and startup replay verification provide the
serialized mutation and fail-closed integrity boundary needed for the bounded
candidate. No distributed consensus or broker is introduced.

The service owns a persistent Ed25519 signing key referenced by
`WITNESS_SIGNING_KEY_PATH`. It emits canonical UTF-8/JCS-derived SHA-256
hash-chain records, signed checkpoints, and signed receipts. Runtime
credentials are separate from the deployment/admin identity and authorize
only namespace root creation, claim, append, read, enumeration, checkpoint,
and verification operations. No delete, rewrite, truncate, reset, or
reinitialize endpoint exists.

The exact V0 contracts are:

- a record digest is SHA-256 of JCS UTF-8 over `{namespace, sequence,
  record_type, payload_digest, previous_record_digest, included_at}`;
- the genesis record is sequence `0` with a null previous digest; its record
  digest is `genesis_digest`, and `genesis_id` is derived from the namespace,
  genesis payload digest, and genesis record digest;
- a checkpoint body is JCS UTF-8 over the seven fields
  `{checkpoint_type, namespace, genesis_digest, head_sequence,
  head_record_digest, checkpoint_time, key_id}`. `checkpoint_digest` is its
  SHA-256, and Ed25519 signs the UTF-8 lowercase hexadecimal digest;
- a receipt body is JCS UTF-8 over `{receipt_type, namespace, sequence,
  record_digest, included_at, checkpoint_digest, key_id}`. `receipt_digest`
  and its signature use the same digest/signature contract;
- public keys are unpadded base64url SPKI DER and key IDs are
  `ed25519:sha256-spki:<lowercase-hex>`.

The public protocol is versioned as `SMOKESTACK_PRODUCTION_WITNESS_V0`.
Production key material, deployment, namespace creation, claim execution,
provider calls, and measurement remain outside this phase. Tests use only
isolated temporary databases, generated test keys, and explicit test
namespaces.

## Consequences

Positive:

- the qualification client is network-mediated and cannot directly use the
  witness database;
- interval consumption, claim discovery, episode binding, and head updates
  commit in one serialized transaction;
- receipts and checkpoints can be verified with only the witness public key
  and returned proof material;
- crash, restart, corruption, and runtime-permission behavior are directly
  testable.

Boundaries:

- this is one authoritative service, not a consensus system or transparent
  failover design;
- SQLite must be replaced or separately justified if a later deployment
  requirement exceeds the V0 single-service boundary;
- this ADR does not authorize production deployment or any V5 live action.
