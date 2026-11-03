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

## Licenses

- Graph data: CC BY 4.0; see DATA_LICENSE.md.
- Code and documentation: MIT; see LICENSE.
- The complete data license is in LICENSES/CC-BY-4.0.txt.
