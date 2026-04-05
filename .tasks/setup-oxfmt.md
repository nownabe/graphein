# oxfmt のセットアップ

PR CI に oxfmt によるフォーマットチェックを追加する。

## やること

- [ ] aqua のセットアップ (`aqua.yaml` の作成、oxfmt のインストール設定)
- [ ] `reusable-oxfmt.yaml` の作成
- [ ] `pr.yaml` の `detect-changes` に oxfmt 用の変更検出パターンを追加
- [ ] `pr.yaml` に oxfmt ジョブと `status-check` の `needs` への追加
