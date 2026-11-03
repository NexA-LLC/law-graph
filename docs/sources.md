# Sources and coverage

## Initial source

The seed uses e-Gov law API v2:
https://laws.e-gov.go.jp/api/2/swagger-ui/

It contains main-provision Articles 2, 16, and 23 of law
415AC0000000057, revision 415AC0000000057_20261102_508AC0000000062,
observed on 2026-11-03 in Asia/Tokyo.

The exact article response, requested element, official law/revision IDs,
request URL, observation time, canonical payload hash, and text evidence
pointers are retained under data/.

The additional contract research corpus contains selected 民法 and construction
law articles. See [the exact law/revision/article manifest and extraction
limits](contracts-coverage.md). Original snapshots remain immutable; the
aggregate records new assertions with new method-specific IDs and evidence.

## Content normalization

sorted-json-v1 sorts object keys, preserves arrays and scalar values, and
hashes the UTF-8 JSON representation without formatting whitespace.
egov-descendant-strings-v1 concatenates source-tree descendant string values
in order. Provision text includes its source title/number and descendants;
no legal wording is generated.

The JSON Pointer addresses the exact source subtree. Evidence validation
re-extracts the subtree text and checks the recorded SHA-256.

## Date handling

The initial importer accepts only source-reported CurrentEnforced revisions
whose enforcement date is no later than observation. Coverage is declared
for the observation day in Asia/Tokyo only. It makes no claim about other
dates, earlier wording, or future applicability.

Queries with an unsupported as_of date return outside_coverage. An omitted
as_of selects the latest declared coverage date and returns that date;
it never means verified current law.

## Coverage is multidimensional

Imported text does not imply all relations have been processed.
The manifest records the law revision, locators, relation types, extractor,
and limitations. No match in this corpus is not proof that no relevant law
or relation exists.

Retrieval and inspection of legal authority at the time of actual use remain
consumer responsibilities. The seed has no automatic refresh.

## Other sources

houritsu is an intended optional adapter; no houritsu content is imported in
the initial release. Its CC BY attribution and modified-data notices must be
recorded when the adapter is implemented. See ATTRIBUTION.md.

## Case sources

The case corpus adds public court, Consumer Affairs Agency, Japan Fair Trade
Commission, and industry-association material. Source kinds remain explicit.
Case source versions record raw-byte hashes and locators without bundling the
original documents. This is not the e-Gov canonical-JSON verification contract.
See [case graph](case-graph.md) and [ATTRIBUTION.md](../ATTRIBUTION.md).
