# Witness V0 deployment contract

Build and run the image from the repository root with a separately managed
Ed25519 PKCS#8 private key and two distinct credentials. Mount
`/var/lib/smokestack-witness` as the durable service-owned volume and mount the
private key at the configured `WITNESS_SIGNING_KEY_PATH` as a secret. Do not
generate the production key from this repository and do not mount a client
database.

The process exposes:

- `GET /healthz`: process liveness;
- `GET /readyz`: readiness for durable witness operations;
- authenticated `/v1/*` append/read/verify operations documented by the
  implementation and client.

Readiness is false when configuration, the signing identity, SQLite schema,
persistence, or startup hash-chain verification is unavailable. No production
deployment is performed by this phase.
