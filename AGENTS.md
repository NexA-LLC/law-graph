# Law Graph

Public data infrastructure for agents. Treat the graph as partial, source-grounded
research material; relation presence is not an individual legal conclusion.

## Working rules

- Keep code and docs MIT; data under data/ uses CC BY 4.0 as described in DATA_LICENSE.md.
- Never commit secrets, private contracts, user questions, or legal consultations.
- Preserve upstream IDs alongside UUIDs. Distinguish a source document, its
  content version, and the precise evidence reference.
- Do not overwrite old source artifacts or reinterpret old evidence as new.
- Do not infer cross-revision provision identity from an article number alone.
- Return outside_coverage, unresolved, and truncated states explicitly.
- Network ingestion is an explicit CLI operation; query tools remain offline and read-only.
- Do not run shared or production database commands. Generated indexes, when
  implemented, belong in ignored local cache files.
- Do not publish, push, release, or create external resources unless authorized
  by the current user request.
- Do not introduce shared agent runtime code into this repository.

## Verification

- npm ci
- npm run check

Document the exact coverage and extractor limits when adding data or relations.
