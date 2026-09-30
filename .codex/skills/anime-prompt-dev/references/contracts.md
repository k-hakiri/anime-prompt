# CLI の公開契約と実験の再現性

CLI / データ / benchmark の変更時に読む。仕様の正本は [Notion](https://app.notion.com/p/3eb4daebe6d481548d93c55b3fdf5cbe?pvs=204)。ここでは開発時に守る境界だけをまとめる。

## CLI 入出力

- stdout は結果だけ。進捗、debug log、warning、retry 情報、対話 UI の案内は stderr へ出す。
- JSONL は1行1JSON。fetch / feature builder は1作品1行、recommend はモデルごとの推薦・usage・cost・latency 等を出す。リダイレクトで機械処理できる形式を維持する。
- `anime-fetch-anilist` は AniList 取得と最低限の正規化のみを行い、AI API を呼ばない。
- `anime-build-features` は正規化済み JSONL を stdin から受け取り、特徴量 JSONL を stdout に出す。
- `anime-recommend` は1実行1プロンプト。`--prompt TEXT` があればその文字列を使う。省略時は TTY で対話入力し、stdin が非 TTY ならエラー終了する。パイプ入力をプロンプトとして受け付けない。
- 出力形式は `--format human` / `--format jsonl`、デフォルトは `human`。`--prompt` と `--format jsonl` で非対話実験を行える。
- API 障害などで実験結果を生成できない場合は non-zero exit code を返す。
- 保存はシェルのリダイレクトで行う。YAML の反復とファイル名生成は薄いバッチスクリプトへ分け、ファイル名は自然文ではなく scenario の `id` から決める。

## データと比較条件

- raw と features は `anime_id` で join する。作品メタデータを features へ丸ごと複製しない。
- 特徴定義は YAML で version 管理する。feature 出力の `feature_schema_version`、`input_profile`、`provider`、`model` を失わない。`score` と `confidence` は分けて保持する。
- `basic` / `full` の入力項目を明示し、同じ raw に対して再実行できるようにする。正式な実験では raw を保存してから特徴量を生成する。
- 各方式の候補集合、気分入力、嗜好を揃える。Luna / Sol はモデル以外の入力、指示、出力 schema、reasoning effort を揃え、比較条件を無断で変えない。
- 計測日、モデル、provider、reasoning effort と再実行に必要な入力・schema・設定を残す。API usage に基づくコストと、Jev の前処理 / 推薦時のコスト・時間を分ける。単価は計測時点の設定として扱う。
- 入出力や schema を変更する必要がある場合は、対象 Issue の範囲内で正本との整合性と既存利用への影響を確認してから変更する。
