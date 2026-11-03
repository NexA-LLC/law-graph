# Sources and modifications

## Initial e-Gov data

Source: e-Gov法令検索 (https://laws.e-gov.go.jp/), Public Data License 1.0
(https://www.digital.go.jp/resources/open_data/public_data_license_v1.0).

NexA LLC selects article responses from the e-Gov law API v2, assigns UUIDs,
extracts structural containment and selected explicit definition phrases,
and records unresolved Cabinet Order delegation phrases. These are project
transformations, not a government-produced graph or a government endorsement.

The graph records the exact official law ID, official revision ID, request URL,
observation time, canonical JSON hash, and source location. See data/ for scope.
Source snapshots are selected article responses, not the full law.

## houritsu

The design was informed by [Kohei-Wada/houritsu](https://github.com/Kohei-Wada/houritsu)
(CC BY 4.0), which represents Japanese law amendments as Git history.
No houritsu data or houritsu-builder code is included in the initial corpus.
A future adapter must retain its attribution and modification notices.

## Public case and guidance sources

Case records add project-authored metadata, summaries, issue links, and scope
notes based on the following public primary documents:

- [Court judgment 35471](https://www.courts.go.jp/assets/hanrei/hanrei-pdf-35471.pdf), 2007-11-27, case 平成17年（ワ）第23171号.
- [CAA publication 024759](https://www.caa.go.jp/notice/entry/024759/) and its [order materials](https://www.caa.go.jp/notice/assets/representation_210629_03.pdf), published 2021-06-29; orders dated 2021-06-28.
- [JFTC recommendation and instruction concerning commissioned content](https://www.jftc.go.jp/houdou/pressrelease/2024/oct/241025_cover.html), 2024-10-25.
- [JFTC overview of the revised commissioned-transaction law](https://www.jftc.go.jp/toriteki/), documenting the 2026-01-01 effective date and revised law name.
- [Joint industry guidelines on randomized NFT sales](https://cryptocurrency-association.org/cms2025/wp-content/uploads/2022/10/GuidelinesforRandomizedNFTSales.pdf), published by JCBA and four other associations in 2022.

The original case/guidance documents are not redistributed. Their original
rights and reuse terms are not replaced by this project's data license.
Only project metadata and original summaries are offered under CC BY 4.0.
Raw originals used for research remain in ignored local caches; public records
retain hashes, observation times, URLs, and page/section locations.
All seed case summaries and topic links are AI-assisted proposed records,
not completed legal-practitioner reviews.

## Licenses

- Graph data: CC BY 4.0; see DATA_LICENSE.md.
- Code and documentation: MIT; see LICENSE.
- The complete data license is in LICENSES/CC-BY-4.0.txt.
