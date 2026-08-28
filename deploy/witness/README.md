# Witness V0 deployment contract

Build and run the image from the repository root with a separately managed
Ed25519 PKCS#8 private key and two distinct credentials. Mount
`/var/lib/smokestack-witness` as the durable service-owned volume and mount the
private key at the configured `WITNESS_SIGNING_KEY_PATH` as a secret. Do not
generate the production key from this repository and do not mount a client
database. Set stable `WITNESS_DEPLOYMENT_ID` and
`WITNESS_DATABASE_INSTANCE_ID` values before initializing the volume.

Initialize a new deployment exactly once, before starting the service:

```sh
npm run build
npm run witness:init
```

The initialization command requires `WITNESS_DATABASE_PATH`,
`WITNESS_SIGNING_KEY_PATH`, `WITNESS_DEPLOYMENT_ID`, and
`WITNESS_DATABASE_INSTANCE_ID`. Normal service startup is open-existing-only;
it never creates a schema or initializes a new witness database. A missing,
empty, reset, or identity-mismatched database keeps readiness false.

The process exposes:

- `GET /healthz`: process liveness;
- `GET /readyz`: readiness for durable witness operations;
- authenticated `/v1/*` append/read/verify operations documented by the
  implementation and client.

`READ_EVENT` returns the requested historical record and the actual current
checkpoint. Its receipt proves historical inclusion only. Current lineage
requires complete genesis-to-current enumeration plus `verifyCurrentLineage`
and consistency verification; an old receipt never proves that no later event
exists.

Readiness is false when configuration, the signing identity, SQLite schema,
persistence identity, or startup hash-chain verification is unavailable. No
production deployment is performed by this phase.
