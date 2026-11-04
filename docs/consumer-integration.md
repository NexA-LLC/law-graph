# Consumer integration and update loop

The ./research export validates the installed statute, case, and comparative
corpora and exposes the same nine read-only tools as stdio MCP. Consumers pin
an exact HTTPS GitHub commit archive of @nexa-llc/law-graph; installation includes the
source artifacts needed for offline statute validation. Query execution has
no network access and never saves questions or contracts.
The dependency URL is https://codeload.github.com/NexA-LLC/law-graph/tar.gz/COMMIT.
This avoids package managers rewriting a GitHub Git URL into an SSH dependency;
the consumer lockfile records archive integrity.

createResearchClient().status() returns the installed package version, three
corpus snapshot hashes, coverage, and offline/read-only mode. call(tool,args)
uses the existing input validators. contextForQuery(text) selects a maximum
of three candidate-retrieval calls using literal topic aliases and registered
research terms. It is not legal judgment. Explicit Japanese/U.S. comparisons
keep their jurisdiction limits; a state-law query cannot silently select
federal law. Complete evidence entries that exceed the context budget are
omitted with an explicit reason; source/coverage metadata remains.

## Source changes

The daily source-watch workflow runs the explicit network CLI
node src/source-watch.mjs against registered public sources only. It checks
current e-Gov law revisions and recorded raw source bytes. It enforces HTTPS,
an exact host allowlist, timeouts, response-size bounds, and no redirects.
The 2026-11-04 live verification checked 32 source versions with no retrieval
errors and found two JFTC raw-byte differences. A byte difference does not
establish a change in substantive law; shared page navigation may also change.

Changed sources create a draft PR with old source-version IDs, old/new hashes,
and revision information. A repeated identical report uses the same bot branch
and does not create another PR. Errors fail the job while preserving the corpus.
The report cannot become an active graph automatically. The reviewer must
inspect the originals and update affected graph snapshots/relations before
calling the corpus refreshed. New cases and substantive comparative summaries
still require a contribution and scope review. Original case/foreign source
bytes are not redistributed by this job.

## Consumer updates

Each consumer's daily update workflow invokes src/update-consumer.mjs from its
installed package. The updater checks the fixed public upstream main branch
and supported research protocol, then updates only the exact dependency pin.
The workflow regenerates its package-manager lockfile and runs consumer tests
before proposing a PR. Failed installation/tests leave deployed installations
unchanged. There is no automatic merge, secret rotation, or production release.
After normal PR review/merge and the consumer's deployment process, the new
process loads the new installed corpus. Until then, it keeps the old pinned
snapshot; runtime code never fetches mutable main on a legal question.

The upstream interface PR must land before consumer update workflows can
target main. Bot-created PRs use GITHUB_TOKEN and run their validation inside
the proposing workflow; GitHub may suppress a separate PR-event workflow for
that token. Repository Actions settings must allow PR creation. If the setting
is disabled the job reports failure; no PAT is silently created or installed.

2026-11-04 readback found can_approve_pull_request_reviews=false and default
workflow permissions=read in law-graph, nexa-clo, and webapp-flowcontract.
The repository setting "Allow GitHub Actions to create and approve pull requests"
must be enabled for GITHUB_TOKEN PR creation. This implementation does not change
that administrative setting. The workflows create draft PRs only and contain
no approval or merge operation. See GitHub's repository Actions settings docs.

Private matter facts and interpretation remain in CLO/FlowContract. Only
public-source update candidates are written to this repository.
