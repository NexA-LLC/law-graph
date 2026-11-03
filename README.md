# Law Graph

AI Agentが法令の条文・概念・関係を辿り、元の出典へ戻るための、UUIDベースの公開グラフです。

独立したデータ基盤として、公開JSON、JSON Schema、e-Gov取り込み、検証、CLI、読取専用MCPを提供します。対象を限定して育てるプロジェクトです。

## 初版の収録範囲

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

この範囲以外の法令、条文、改正履歴、意味関係は網羅していません。
`as_of`は収録した取得日だけを受け付け、他の日付は`outside_coverage`を返します。
日付を省略した場合も、結果に使用した取得日を明示します。現在の法状態へ自動更新する機能はありません。

## 使う

Node.js 22以上で、次を実行します。

```sh
npm ci
npm run check
node src/cli.mjs coverage
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

提供ツールは`search_provisions`、`resolve_citation`、`get_provision`、`traverse_relations`です。
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
