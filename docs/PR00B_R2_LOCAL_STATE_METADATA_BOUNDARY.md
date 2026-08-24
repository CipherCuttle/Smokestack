# PR-00B R2 — Local-State Metadata Boundary

## Identity

- Phase: `PR-00B_R2_LOCAL_STATE_METADATA_BOUNDARY`
- Predecessor SHA: `6a60ab6203406aaf6ac5604ab97017f245addf07`
- Predecessor terminal status: `CLOSED_FAIL_TARGETED_REREVIEW_CRITICAL_HIGH_FOUND`
- R1 remains immutable failed historical lineage.

## Surviving RH02 High

The final R1 targeted rereview returned `RH01 = PASS`, `RH02 = FAIL`, `RH03 = PASS`, with `CRITICAL = 0` and `HIGH = 1`. The surviving High was that effective external/global `core.attributesFile` and `core.excludesFile` references were omitted by `git config --local --includes`; mutating either referenced file changed Git staging/ignore semantics while `compareGitMetadataState(...).ok === true` with no changes.

## R2 contract

- Reproduced failure path: in a temporary Git repo, set `GIT_CONFIG_GLOBAL` to a config referencing external attributes/excludes files, capture metadata, mutate a referenced file, and observe changed `git check-attr`/`git check-ignore` results with an unchanged metadata comparison.
- Frozen repair objective: bind effective included Git configuration and fingerprint effective `core.attributesFile` and `core.excludesFile` targets across config scopes, preserving fail-closed resource, include, symlink, and filter protections.
- Required falsification regression: a zero-model test must prove both external-file mutations change effective Git behavior and make metadata comparison fail closed; the pre-repair `--local` implementation would fail this test.

## Acceptance

- The exact RH02 exploit is reproduced and fails closed.
- Existing R1 controls and regressions remain passing.
- Required syntax, zero-model, package, and diff checks pass.
- No live qualification is run; no merge is performed.
- Next gate: one independent hostile review by a reviewer who did not author R2.

## Explicit non-goals

No redesign of RH01 or RH03, no live qualification, no merge, no PR-01, and no claim that R1 passed or that PR-00B is fully qualified.
