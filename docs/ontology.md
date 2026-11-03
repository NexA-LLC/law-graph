# Ontology

Law, LawRevision, Provision, ProvisionVersion, Concept, Source, SourceVersion,
EvidenceRef, Intent and Authority are distinct UUID-bearing records.
Locators describe selected main provisions, for example
`main/article:19/paragraph:3`. Upstream underscore branch numbers are preserved.
Provision identities remain revision-anchored; article numbers do not establish
cross-revision identity.

Intent contains `id`, a stable `slug`, `label` and `description`. Authority
contains `id`, `jurisdiction` and `label`. Neither is an individual case record.

| Relation | Endpoints | Basis |
| --- | --- | --- |
| contains | Revision/provision → provision | Source tree |
| defines | Paragraph → law-scoped concept | Narrow literal definition pattern |
| cites | Provision → collected provision, otherwise unresolved | Selected literal reference patterns |
| delegates_to | Delegating provision → implementing provision, otherwise unresolved | Delegation phrase and implementation-side reference |
| administered_by | Law revision → Authority | Explicitly labelled textual inference from minister/ministry mentions |
| relates_to | Intent → law revision or provision version | Curated research link with a reason and precise supporting provisions |

New assertions carry `review_state=unreviewed`, `reason`, nonempty
`basis_provision_ids` and `evidence_ref_ids`, plus type, endpoints, method, basis
and resolution. `resolved` means an endpoint was identified, not legal approval.
Unresolved references retain `to_id=null` and the observed `target_ref`.
Resolved delegation requires evidence from both the delegating and implementing
provisions. Authority assertions attach to a revision so their scope is dated.
Minister mentions support an inference, not an authoritative or exhaustive list
of competent agencies. Intent links are curated suggestions, not applicability
decisions; their reasons are project annotations, never generated law text.

The additive v0 schema still accepts the immutable initial seed. Its structural
relations retain legacy `review=unreviewed` and their existing IDs. New assertions
use a different identity tuple covering the full claim; consumers should expose
`review_state` (falling back to legacy `review`). Optional `intents` and
`authorities` collections allow old snapshots to remain byte-for-byte unchanged.

Exceptions, full reference grammar, legal applicability, review workflows,
cross-revision lineage and semantic similarity remain outside this contract.

## Planned relations

applies_mutatis_mutandis, exception_to, related_to, supersedes,
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
