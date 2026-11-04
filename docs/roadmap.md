# Roadmap

The initial release proves an inspectable source-to-query path with a small
public corpus. It does not attempt complete coverage.

## Next bounded iterations

The case/issue iteration now supplies three topics, one judgment, two
administrative examples, source metadata, draft summaries,
independent case bundles, and a contribution/review entry point.
The initial case data has no legal-practitioner review. Next priorities are
source and scope review, additional contrasting examples, current-law text
connections, and private consumer integration.

A comparative prototype adds three Japanese/U.S. federal copyright issues
and one tool; with intent lookup, there are nine read-only tools in total. It keeps original language,
reference translations, editions, differences, and coverage separate. Review
by practitioners in both jurisdictions, foreign case evidence, and confirmed
legal-date alignment remain future work; current applicability is not assessed.

1. Build a public evaluation set of concrete research questions, expected
   supporting provisions, out-of-coverage cases, and unresolved references.
2. Expand the implemented narrow citation/delegation rules with coordinated
   references, relative antecedents and supplementary-provision disambiguation.
3. Define immutable review records and source-correction handling.
4. Add explicit provision-lineage mappings and historical date ranges.
5. Add optional houritsu ingestion without depending on mutable Git SHAs.
6. Generate local search indexes and compare them against the literal-search
   baseline before adding semantic/vector search.

Before expanding the corpus, measure correct evidence retrieval, incorrect
references, unsupported-date handling, and retrieval calls/token costs.

## Consumer integrations

The offline research export, public-source watcher, and consumer pin-update
helper are implemented. The companion CLO/FlowContract PRs add the actual
consumer paths. See [consumer integration](consumer-integration.md) for release
order and the Actions PR-permission prerequisite.

Contract-to-law links and company-specific conclusions belong in private
consumer systems. No private integration, production deployment, hosted
service, or npm publication is part of this initial public repository.
