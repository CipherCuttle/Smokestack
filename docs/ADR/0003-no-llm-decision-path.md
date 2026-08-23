# ADR-0003: No LLM or Embedding in V0 Decision Path

Status: ACCEPTED

## Context

Semantic models can make clusters look compelling while adding nondeterminism, hidden model/version dependencies and circular narrative evidence.

## Decision

V0 Formation membership and Silent Ignition decisions use deterministic structural/attention contracts only. A future LLM may suggest labels after a Formation snapshot is frozen. Labels cannot change membership, FIRE/NO_SIGNAL, or decision digests.

## Consequences

V0 can output `UNNAMED FORMATION #N`. This is preferable to a persuasive hallucinated narrative.
