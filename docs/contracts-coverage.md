# Contract research corpus: 2026-11-03

All source article responses were retrieved from the official e-Gov law API v2
using `node src/cli.mjs import-egov`. Observation coverage is **2026-11-03 JST
only**, not a claim about any other date. Source-reported revisions are
CurrentEnforced. Every selected article includes its descendant paragraphs,
items and subitems, including tables where present.

| Added law | Official law ID | Official revision ID | Main-provision articles |
| --- | --- | --- | --- |
| 民法 | 129AC0000000089 | 129AC0000000089_20260624_508AC0000000045 | 632, 633, 634, 636, 637, 641, 642 |
| 建設業法 | 324AC0000000100 | 324AC0000000100_20251212_506AC0000000049 | 3, 18, 19 |
| 建設業法施行令 | 331CO0000000273 | 331CO0000000273_20260401_507CO0000000412 | 1, 5_5 |
| 建設業法施行規則 | 324M50004000014 | 324M50004000014_20261001_508M60000800082 | 1, 4, 13_4, 13_5, 13_6 |

The aggregate additionally retains the initial personal-information law seed
(415AC0000000057, revision 415AC0000000057_20261102_508AC0000000062,
Articles 2, 16, 23). No original graph or source artifact is overwritten.
There are 5 laws, 20 selected article payloads, 156 provision versions,
11 resolved citations, 68 unresolved citation phrases, 4 resolved delegations,
31 unresolved delegations and 3 authority inferences in the research corpus.
Of the unresolved delegations, 10 are retained legacy structural-extractor
candidates; a candidate can coexist with a later resolved assertion. Counts are
assertions by method, not distinct legal obligations.

## Reproduce the offline aggregate

```sh
node src/cli.mjs merge-graphs \
  --graphs data/laws/415AC0000000057/seed.graph.json,data/laws/129AC0000000089/contract-20261103.graph.json,data/laws/324AC0000000100/contract-20261103.graph.json,data/laws/331CO0000000273/contract-20261103.graph.json,data/laws/324M50004000014/contract-20261103.graph.json \
  --intents data/intents/contracts.catalog.json \
  --out .cache/contracts-rebuilt.graph.json
```

The command is offline, validates each input and the output, and refuses an
existing output path. It deduplicates identical IDs, unions compatible
same-revision/day locator sets, and rejects conflicting records or coverage
metadata. It never equates provisions across revisions by article number.
Different revisions remain separate; multiple same-day target matches remain
unresolved. Input order does not select a preferred revision.

## Extractor boundaries

`egov-references-v1` scans each provision's own text, excluding nested provision
text to avoid duplicate extraction. It handles explicit article numbers in
kanji (through thousands) or Arabic digits, branch articles, and an immediately
following paragraph/item. The exact collected locator and a shared observation
day are required for resolution. Full law names and the literal declarations
`以下「法」という。` / `以下「令」という。` establish narrowly supported names
and aliases; the declaration provision is included in the evidence. Unrecognised
qualifiers and missing/ambiguous targets remain unresolved. Bare references
resolve only in a restricted set of syntactic positions. Relative 前条, 同条,
次条, 前項 and 同項 remain unresolved. Ranges are not expanded; coordinated
references, antecedents, historical references, supplementary provisions and
full Japanese citation grammar are not implemented. This is not exhaustive.

Delegation extraction recognises 政令で定める and 国土交通省令で定める.
It links only to collected implementation clauses with a resolved back-reference
to the exact delegating provision, the matching official ID kind (CO/M), and a
narrow `の規定により` or `の国土交通省令で定める` clause. Evidence includes
both sides and any alias declaration. It does not select a decree from a law's
title alone. The resulting Act → Order → Rule example is:

```text
建設業法 19条3項
  → 建設業法施行令 5条の5第1項
    → 建設業法施行規則 13条の6第1項
```

`egov-authority-inference-v1` records 国土交通省 candidates for the three
construction-law revisions from their minister/ministry mentions. It does not
claim an authoritative or exhaustive administrative remit. 民法 and the
personal-information seed have no authority assertions in this release.
All new inferred, extracted and curated relations are `unreviewed`.

## Intent samples

The default aggregate adds 3 Intent nodes and 6 curated `relates_to` assertions
from `data/intents/contracts.catalog.json`. Each assertion includes a project
reason, supporting provision-version UUIDs and their exact source evidence IDs.

| Slug | Exact label | Research targets |
| --- | --- | --- |
| contract-work | 請負契約を結ぶ | 民法 revision, supported by Articles 632 and 633 |
| construction-contract | 建設工事の請負契約を結ぶ | 建設業法19条, 施行令5条の5第1項, 施行規則13条の4第1項 |
| cancel-contract-work | 請負契約を解除する | 民法641条, 642条 |

`find_related_laws` accepts only an exact slug or label after NFKC normalisation
and trimming the input. It returns the law/revision IDs, supporting provisions,
reason, evidence, review state and bounded result counts. Unsupported intents,
missing dated links and unsupported dates return `outside_coverage`. It performs
no network access, file writes, similarity search or legal applicability decision.
