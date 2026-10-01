# CLI の公開契約と実験の再現性

CLI / データ / benchmark の変更時に読む。仕様の正本は [Notion](https://app.notion.com/p/3eb4daebe6d481548d93c55b3fdf5cbe?pvs=204)。ここでは開発時に守る境界だけをまとめる。

## CLI 入出力

- stdout は結果だけ。進捗、debug log、warning、retry 情報、対話 UI の案内は stderr へ出す。
- JSONL は1行1JSON。fetch は1作品1行、recommend はモデルごとの推薦・usage・cost・latency 等を出す。リダイレクトで機械処理できる形式を維持する。
- `anime-fetch-anilist` は AniList 取得と最低限の正規化のみを行い、AI API を呼ばない。
- `anime-recommend` は保存済み raw JSONL を読む直接推薦を主経路とする。1実行1プロンプトで、`--prompt TEXT` があればその文字列を使う。省略時は TTY で対話入力し、stdin が非 TTY ならエラー終了する。パイプ入力をプロンプトとして受け付けない。
- 出力形式は `--format human` / `--format jsonl`、デフォルトは `human`。`--prompt` と `--format jsonl` で非対話実験を行える。
- `--input-profile basic|full` を選択でき、デフォルトは `full` とする。
- API 障害などで実験結果を生成できない場合は non-zero exit code を返す。
- 保存はシェルのリダイレクトで行う。YAML の反復とファイル名生成は薄いバッチスクリプトへ分け、ファイル名は自然文ではなく scenario の `id` から決める。

## 直接推薦のデータと比較条件

- 主経路は **raw → direct recommendation → Top 5**。保存済みの正規化済み作品情報を各モデルへ直接渡し、推薦のための中間特徴量は生成しない。FeatureRecord、MoodProfile、feature schema、raw/features join は主経路の依存にしない。
- `basic` は title / description / genres / format / episodes / duration、`full` は basic + tags / tag rank / source。同じ raw に対して profile を切り替えて再実行できるようにする。studio・人気・スコア指標は主比較の入力に含めない。
- 標準候補は対象シーズン・年の `isAdult: false` の作品とする。成人向けを除外し、人気・スコアによる足切りは行わない。format / duration の追加フィルタは別 Issue として判断する。
- Jev は自然文の気分を state、選択した profile の候補作品を Choice criteria へ渡す。choice key は `anime_id`、確率降順から Top 5 を生成する。全候補の probabilities、confidence、usage、latency を保存し、human は順位・タイトル・選択確率を中心に表示する。長文理由は生成しない。
- 各方式の候補集合、作品情報の profile、気分入力、嗜好を揃える。同じ raw を再利用し、Luna / Sol はモデル以外の入力、指示、出力 schema、reasoning effort を揃え、比較条件を無断で変えない。
- 計測日、モデル、provider、reasoning_effort、strategy、input_profile と再実行に必要な入力・設定・candidate_ids・raw hash 等を残す。推薦時の API usage と latency を記録し、コスト単価は計測時点の設定として扱う。価格計算が未実装の場合は未計算と明示する。
- 入出力や schema を変更する必要がある場合は、対象 Issue の範囲内で正本との整合性と既存利用への影響を確認してから変更する。

## 旧6軸方式の追加実験時のみ適用する契約

旧 `anime-build-features`、feature schema、FeatureRecord、MoodProfile、ローカル距離ランキングは追加比較・過去実験の再現用として保持する。以下はこの方式を扱う場合だけ適用する。

- `anime-build-features` は正規化済み JSONL を stdin から受け取り、特徴量 JSONL を1作品1行で stdout に出す。
- raw と features は `anime_id` で join する。作品メタデータを features へ丸ごと複製しない。
- 特徴定義は YAML で version 管理する。feature 出力の `feature_schema_version`、`input_profile`、`provider`、`model` を失わない。`score` と `confidence` は分けて保持する。
- raw を保存してから特徴量を生成し、schema・入力 hash・生成条件を記録する。特徴量生成の前処理コスト・時間と推薦時のコスト・時間を分ける。
