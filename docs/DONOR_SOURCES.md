# Donor Sources

Old repositories are allowed donors. This file exists for engineering reproducibility: when behavior is ported, record the exact repo/commit/file or feature lineage so later maintainers can compare semantics.

There is no licensing/provenance gate in this document.

## Amali

Useful concepts/code to inspect: launch discovery and enrichment, deployer/security state, evidence/catalyst plumbing, and Meta Radar as a baseline rather than the new detector.

## Pyroshade

Known feature/closure ref: `4e0aca7ac235e0731fcabd28f96233e163bbda5b` (`narrative_swarm_copyability_v0` closure).

Useful primitives to port selectively in PR-04 or later: early-owner extraction, recurrence observations, known service/protocol account exclusion, structural launch facts, deterministic candidate/outcome separation and control ideas.

Do not reopen/reinterpret the closed empty A→E packet as evidence.

## SerrataOS

Useful concepts/code: Tripwire/Blackline information architecture, content-addressed receipt patterns, independent verification philosophy. Public receipt implementation is deferred until PR-12.

## RekTrace

Useful concepts/code: signal broadcast plumbing, quiet-hours/posting-budget ideas, chain adapter patterns. Its lightweight TTL attestation is not the Smokestack public receipt contract.

## daemonlink

Known corroboration ref: `7f804d4b2117c7f7aa9cc07306029e1ab441bcfe`.

Useful concepts/code: distinct-source corroboration, explicit `NO_SIGNAL`/quality state, novelty/fluff accounting.

## Grudge.bid

Known share-card ref: `41eea0e58c54f4cd896d82067914851e251e0b89`. Useful later for deterministic SVG/social cards.

## QntyPolicyGate

Known atomic-publication ref: `ce723e361dc4c7bee4a6a246b1db21799d72cf61`. Useful later for immutable publication identity and conflict classification; implement the pattern with PostgreSQL transactional outbox when notifications are authorized.
