# Architecture

Law Graph separates public legal evidence from the private decisions of its consumers.

```mermaid
flowchart LR
  E[e-Gov selected articles] --> I[Explicit ingestion]
  I --> V[Identity and evidence validation]
  V --> G[Public JSON graph and source artifacts]
  G --> Q[Offline query library]
  Q --> C[CLI]
  Q --> M[Read-only stdio MCP]
```

Each query process reads one graph snapshot. The offline `merge-graphs` CLI
combines validated snapshots, rejects identity conflicts, and adds reproducible
reference and authority assertions. The original inputs remain unchanged.
Each snapshot contains
law identities, law revisions, provision lineages, provision versions, scoped
concepts, source documents, source content versions, evidence references,
relation assertions, observations, and explicit partial coverage.

Source artifacts are selected article responses. They allow evidence validation
without a network call. This small seed deliberately keeps source text available
locally. A future large corpus may distribute content-addressed artifacts
outside Git while preserving the same evidence contract.

## Boundaries

- Public data: law identities, source material, relations, provenance, and coverage.
- Contract products: private links between a specific contract revision and
  specific law-graph node/snapshot identifiers.
- Company legal agents: case facts, interpretation, and decisions.
- Shared agent runtimes: execution and authentication outside this repository.

A relation is a documented assertion with a basis and resolution state, not
a declaration that a provision applies to an individual case.

## Implemented and deferred

Implemented: e-Gov selected-current-article ingestion, reproducible UUIDs,
source hash checks, evidence text checks, containment, a narrow definition
extractor, unresolved delegation candidates, literal search, exact citation
resolution, bounded traversal, offline aggregation, narrow citation/delegation
rules, authority candidates, curated Intent lookup, CLI, and stdio MCP.

Deferred: houritsu input, historical interval resolution, automatic lineage
mapping, full citation resolution, comprehensive definition extraction,
review workflows, exceptions, cross-revision lineage mapping, generated SQLite
indexes, and semantic/vector search.

No graph database, shared database, HTTP service, or private integration is
required to run the initial version.
