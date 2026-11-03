# Identity

The protocol namespace is fixed in data/registry/identity.json.
All graph entity identifiers use UUIDv5 over UTF-8 JSON-encoded name tuples.
Object keys are lexically sorted; array order and strings are preserved.
Content hashes use SHA-256, not the UUID hash.

| Entity | Name tuple after the entity kind |
| --- | --- |
| Law | jurisdiction, official ID scheme, official law ID |
| LawRevision | law UUID, official revision ID |
| Provision | law UUID, first observed law-revision UUID, locator |
| ProvisionVersion | provision UUID, law-revision UUID |
| Concept | law UUID, definition label |
| Source | provider, provider document ID |
| SourceVersion | source UUID, upstream revision ID, selected element, media type, content hash |
| EvidenceRef | source-version UUID, JSON Pointer, text extraction version |
| Relation | extractor version, type, endpoints, evidence UUID, unresolved target descriptor |
| Intent | slug |
| Authority | jurisdiction, label |
| New assertion | complete assertion object excluding id; includes reason, method, review_state, endpoints, target_ref, evidence and basis provision IDs |

The functions in src/identity.mjs define the exact tuple encoding.
New assertions use `id('assertion', content)` in src/assertions.mjs. Legacy
structure assertions keep their original `id('relation', ...)` encoding.

## Source identity

source_id identifies the source document. source_version_id identifies its
exact selected content. evidence_ref_id identifies a location inside that
content. Upstream IDs remain separate fields.

Different providers have different source IDs even when they represent the
same law. A corrected payload under the same upstream revision ID receives a
different source-version UUID. Existing artifacts are never overwritten.
A content hash proves consistency with the stored snapshot, not a
cryptographic signature or independent government authentication.

The initial importer creates provision anchors from the observed revision.
It does not automatically map lineages across unseen revisions. Renumbering,
splits, merges, reused numbers, and corrections require an explicit mapping
and review design before snapshots can be aggregated.

## Snapshot identity

snapshot_id is SHA-256 of canonical graph JSON excluding observation records.
Re-fetching identical inputs at a different time on the same coverage day
preserves entity IDs and the snapshot ID. A changed coverage day changes the
snapshot. Observation times are retained separately from legal effective dates.

## Case corpus identity

The separate case schema uses the same UUID namespace. Topics and issues use
jurisdiction and stable registry keys. A Case identifies a particular published
decision or event, rather than every stage of a legal proceeding.

For case sources the Source tuple is provider plus document key. SourceVersion
uses source UUID, null upstream revision, full_document selection, media type,
and the SHA-256 of raw downloaded bytes. The declared hash method is
raw-bytes-sha256-v1. EvidenceRef uses source-version UUID, structured page/section
locator, and document-locator-v1. Case claims and relation assertions include
their contents and evidence references in their UUID name tuples.

Review records include a subject UUID, subject content hash, scope, outcome,
declared reviewer, actual PR review reference, timestamp, reason, and optional
superseded record. The review UUID covers this complete record. Stale reviews
remain visible but do not automatically cover changed content or establish
legal approval.

## Comparative corpus identity

Jurisdiction IDs use a registry key such as JP or US-federal. A Law uses the same
jurisdiction/official-ID tuple as the statute graph; language is not a jurisdiction.
A shared comparative Issue uses its stable issue key without a jurisdiction.

Comparative SourceVersion uses source UUID, upstream revision ID (or null),
comparative-document selection, media type, and raw-byte SHA-256. The original
law's version and the retrieval observation remain distinct. A compilation's
reported-through date points to separate official edition evidence.

A comparative Anchor uses law UUID, official locator, source-version UUID, and
original/reference-translation role. These anchors do not establish provision
lineage or automatically resolve to the statute graph's ProvisionVersion IDs.
A reference translation must identify an original anchor of the same law,
locator, and declared revision. The comparative link UUID covers its complete
contents, including both sides, differences, and exclusions. A changed summary
keeps its anchor identity; the corpus snapshot hash records the changed content.
