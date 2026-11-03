# Initial ontology

## Entities

Law, LawRevision, Provision, ProvisionVersion, Concept, Source, SourceVersion,
and EvidenceRef are distinct identity-bearing records.

The initial locators describe the main provision only:
main/article:2/paragraph:1/item:1. Upstream underscore branch numbers are
preserved. Supplementary provisions are not imported by this version.

## Assertions

| Type | Meaning | Current implementation |
| --- | --- | --- |
| contains | Structural containment | Resolved from the source tree |
| defines | An explicit definition of a law-scoped concept | Only a direct paragraph sentence matching この法律において「…」とは、 |
| delegates_to | A phrase delegating to a Cabinet Order | Unresolved candidate; no destination inferred |

Every assertion has a UUID, endpoints, evidence IDs, explicit_text basis,
extractor version, resolution, and unreviewed review state. Resolved means
the graph endpoint was identified; it does not mean human legal approval.

Delegation assertions have to_id=null and a target_ref containing the observed
phrase. A missing target stays visible during traversal.

## Planned relations

cites, applies_mutatis_mutandis, exception_to, related_to, supersedes,
split_from, and merged_from require further extraction and evaluation work.
Interpretation and similarity must use separate basis values and cannot be
silently promoted into explicit textual facts.

## Case and issue graph

The separate cases schema defines Topic, Issue, Case, Claim, Source,
SourceVersion, EvidenceRef, and Review records. Case kinds distinguish judgments,
administrative actions, and business examples. Industry and regulatory guidance
are source types, not judicial outcomes.

Relations are raises, illustrated_by, and guidance_on. Their basis is
curated_association, with explicit material differences and proposed review state.
See [case-graph.md](case-graph.md) for claim kinds and temporal boundaries.
