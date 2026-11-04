# Law Graph

AI Agentが法令の条文・概念・関係を辿り、元の出典へ戻るための、UUIDベースの公開グラフです。

独立したデータ基盤として、公開JSON、JSON Schema、e-Gov取り込み、検証、CLI、読取専用MCPを提供します。対象を限定して育てるプロジェクトです。

## 収録範囲

標準のグラフは、次の初版 seed と、民法・建設業法・施行令・施行規則の選択条文を統合した調査用コーパスです。
合計5法令・20条・156条項号版、Intent 3件を含みます。
追加4法令のID・版・条と抽出限界は[収録範囲の詳細](docs/contracts-coverage.md)に記載しています。
以下は保持している初版 seed の範囲です。

| 項目 | 内容 |
| --- | --- |
| 法令 | 個人情報の保護に関する法律 `415AC0000000057` |
| 版 | `415AC0000000057_20261102_508AC0000000062` |
| 取得日 | 2026-11-03 JST |
| 本則の条 | 第2条、第16条、第23条 |
| 条・項・号の版 | 49ノード |
| 概念 | 特定の定義文パターンから抽出した10ノード |
| 関係 | 包含49、定義10、未解決の政令委任候補7 |
| 確認状態 | 全て規則抽出による `unreviewed` |

明示した収録範囲以外の法令、条文、改正履歴、意味関係は網羅していません。
`as_of`は収録した取得日だけを受け付け、他の日付は`outside_coverage`を返します。
日付を省略した場合も、結果に使用した取得日を明示します。現在の法状態へ自動更新する機能はありません。

## 事例と論点から調べる

NFTランダム販売、NDA、委託取引の3テーマについて、確認すべき事実・論点・事例・指針を結び付けるグラフを追加しました。
初期データは裁判例1件と行政事例2件、論点5件、出典6件です。業界指針は判決と分け、NFTそのものの適法性を判断した裁判例は未収録と表示します。

```sh
node src/cli.mjs topic --topic NFT
node src/cli.mjs topic --topic NDA
node src/cli.mjs topic --topic 下請法
node src/cli.mjs cases --query 'NFT ガチャ'
node src/cli.mjs case --id courts-35471
```

主張・事実・裁判所の判断・行政の認定・編集者の推論を区別し、比較上の相違点を返します。
要約と関連付けは全てAI補助の整理案で、法律実務者によるレビューは未実施です。現在の個別案件への適用は判定しません。
事例の原文は再配布せず、内容ハッシュ・元URL・頁や節・独自要約を記録しています。

[事例グラフ](docs/case-graph.md) · [Agentからの使い方](docs/consumer-research-flow.md) · [協力者向けの入口](docs/contributing-cases.md)

## 法域をまたいで比較する

日米著作権の3論点について、法域・言語・出典の版を分けて比較する試作を追加しました。

```sh
node src/cli.mjs compare --issue 引用 --jurisdictions JP,US-federal
node src/cli.mjs compare --issue 職務著作 --jurisdictions JP,US-federal
node src/cli.mjs compare --issue 権利譲渡 --jurisdictions JP,US-federal
```

比較は共通の調査論点への接続で、制度の同一性や同じ結論を示しません。
米国側の法令集は2025年12月18日までの改正を収録する版で、取得日時点の最新法との一致は未検証です。
州法、他の国、外国の裁判例、個別案件の適用法判断は未収録・未評価です。[比較グラフの範囲](docs/comparative-law.md)

## 使う

Node.js 22以上で、次を実行します。

```sh
npm ci
npm run check
node src/cli.mjs coverage
node src/cli.mjs find-related --intent contract-work
node src/cli.mjs find-related --intent 建設工事の請負契約を結ぶ --limit 3
node src/cli.mjs search --query 個人情報 --limit 3
node src/cli.mjs resolve --law-id 415AC0000000057 --article 2 --paragraph 1
```

解決結果の`id`を使って本文と関連を取得できます。

```sh
node src/cli.mjs get --id <provision-version-uuid>
node src/cli.mjs traverse --id <provision-version-uuid> --direction both --depth 2
```

初版の検索はJSON内の文字列による検索です。検索用SQLite、ベクトル検索、自然言語からの法的な適用判定は今後の評価対象です。

## Agentから使う

CLO・FlowContractなどのサーバーからは、固定したGitコミットの依存として
`@nexa-llc/law-graph/research` の読取APIを利用できます。
出典変更の定期検知と利用側の依存更新は検証付きPRで提案します。
[接続と更新の仕組み](docs/consumer-integration.md)を参照してください。

MCPクライアントに、チェックアウト先の絶対パスを指定します。

```json
{
  "mcpServers": {
    "law-graph": {
      "command": "node",
      "args": ["/absolute/path/to/law-graph/src/mcp.mjs"]
    }
  }
}
```

提供ツールは`find_related_laws`、`search_provisions`、`resolve_citation`、`get_provision`、`traverse_relations`と、
`explore_topic`、`search_cases`、`get_case`、`compare_issue`です。
`find_related_laws` は Intent の slug またはラベルの完全一致（NFKC正規化・入力前後の空白除去あり）で、法令・条文・理由・根拠条文ID・出典・`review_state`を返します。
未登録の目的・未収録の日時は `outside_coverage`、件数上限は `truncated` で明示します。
登録済み slug は `contract-work`、`construction-contract`、`cancel-contract-work` です。
理由は人手で作成した調査用の注記です。条文本文は e-Gov の取得データに由来します。
MCPはstdioのみで、起動時にローカルのグラフと根拠を検証します。検索時のネットワークアクセス、データ更新、質問の保存は行いません。

## 出典を辿る

```text
条文・関係
  → evidence_ref_id       根拠箇所
  → source_version_id     内容を固定した出典の版
  → source_id             出典文書
  → upstream_ids / URL    提供元の識別子
```

UUIDと提供元のIDを併記します。同じ法令の公式IDは法令の識別に、出典UUIDはどの資料から得たかの識別に使います。公開グラフに個別契約や案件の事実は含めません。個別案件への適用や解釈は利用側で扱います。

## データを追加する

取り込みは明示的なCLI操作です。現在施行済みの版から、本則の条を1〜10件選択できます。

```sh
node src/cli.mjs import-egov \
  --law-id 415AC0000000057 \
  --articles 2,16,23 \
  --out data/laws/415AC0000000057/new-snapshot.graph.json
```

`--revision-id`で取得する版を固定できます。最初のレスポンスの版を残りの取得にも使用し、混在を検出すると失敗します。出力先の上書きは拒否します。
追加したファイルを使う場合はCLIまたはMCPに`--graph <path>`を渡します。
`merge-graphs --graphs <カンマ区切りのパス> --out <新しいパス>`で、ローカルのグラフを検証して統合できます。
請負契約の調査用に民法・建設業法・施行令・施行規則の選択条文を追加しました。
追加法令のID・版・条と抽出限界は[収録範囲](docs/contracts-coverage.md)を参照してください。

## 構成

```text
data/
  registry/        固定したUUID名前空間とID規則
  laws/            グラフと収録範囲
  sources/         取得した公開資料のスナップショット
  cases/           事例ごとの論点・出典・独自要約・確認記録
  comparative/     法域別の根拠と共通論点への比較リンク
schemas/           JSON Schema
src/               取得・抽出・検証・照会・CLI・MCP
tests/             破損、時点、未解決、MCPの検証
docs/              設計、出典、実装範囲
```

[設計](docs/architecture.md) · [ID](docs/identity.md) · [関係](docs/ontology.md) · [出典](docs/sources.md) · [今後の範囲](docs/roadmap.md)

## ライセンス

コードと文書は[MIT](LICENSE)、`data/`のプロジェクトによるグラフへの寄与は[CC BY 4.0](DATA_LICENSE.md)です。
[e-Govの出典と加工内容](ATTRIBUTION.md)を保持してください。条文や事実に新たな独占的権利を設定するものではありません。

[houritsu](https://github.com/Kohei-Wada/houritsu)は設計の参考です。初版には同プロジェクトのデータや生成コードを含めていません。
