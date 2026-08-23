# Direct Dependency Register

Every direct dependency must be exact-pinned in `package.json` and explained here.

## Runtime dependencies

None in PR-00.

## Development dependencies

### `typescript` 6.0.3

Purpose: static type checking and deterministic compilation for the Node/TypeScript foundation.

Why not TypeScript 7 in PR-00: 7.x is a major native-toolchain transition. PR-00 chooses the serviced 6.0 bridge line to minimize bootstrap/tooling uncertainty. Upgrade requires a bounded compatibility PR, not ambient drift.

Removal condition: only if the Node/TypeScript toolchain later provides equivalent project-wide static verification with lower total risk.

### `@types/node` 24.10.9

Purpose: Node 24 API typings from the same major runtime family as pinned Node 24.19.0.

The patch/minor need not match the Node runtime; the important constraint is avoiding a newer Node major's API surface in the type environment.

Removal condition: if the Node/TypeScript toolchain ships authoritative runtime typings directly.

### Transitive `undici-types` 7.16.0

Pulled by `@types/node` only; types-only, no runtime execution. Locked transitively for reproducibility.

## Package manager

npm 11.17.0 from the pinned Node 24.19.0 distribution. No alternate package manager is required in V0.
