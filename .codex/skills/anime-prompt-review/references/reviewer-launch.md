# Reviewer 本体の起動と model / effort

起動者が読む。2026-10-01 にローカルの Orca 1.4.217 / Codex CLI 0.159.2 の実仕様を確認した。更新後は同じ確認をやり直し、未確認の model ID や CLI option を推測で固定しない。

## 標準構成

標準は **`gpt-6.1-sol` / `medium`**。Issue #3 の「GPT-5.6 Sol 6.1」は表示名の表記揺れとして扱い、実環境の model catalog にある `gpt-6.1-sol` と、その `supported_reasoning_levels` の `medium` を確認した。CLI の実起動でも header に model / reasoning effort / sandbox の実効値が表示され、`REVIEWER_PROBE_OK` を返して終了コード0だった。

利用する環境でこの ID / effort が利用できなければ暗黙の default や別モデルへ切り替えず、その制約を報告して reviewer の構成を確定する。これはレビュー用設定であり、推薦 benchmark の比較設定を変更しない。

## 入力・起動・結果の順序

1. 起動前の Review Package に requested configuration（model ID / effort / read-only 方針）と予定する起動経路を記す。実効値を先に要求しない。
2. その Package と Superpowers template で、初回は実装者とは別の fresh context の reviewer を起動する。再 review は原則として同じ reviewer / context を再開する。大幅な設計変更・scope 変更・判断の不一致・継続不能の場合のみ、理由を記録して fresh context でやり直す。
3. launcher が各回の起動後の header / receipt から reviewer 本体の effective configuration と session / context ID を取得し、requested と照合する。再開時は前回の reviewer ID と一致することも確認する。
4. 一致した場合のみ、その review の最終 verdict を採用し、effective 値・確認方法・一致判定を結果と一緒に記録する。不一致・未確認なら review は無効として、設定または経路を確定して再実行する。初回は fresh context、再 review は同じ reviewer / context を原則とし、第2項の例外時だけ理由を記録して fresh context へ切り替える。設定の修復後に同じ reviewer / context を継続できる場合は継続する。先行 probe の設定や仲介 agent の設定では今回の reviewer 本体の確認を代用しない。

## Orca から新規 reviewer を直接起動する場合

先に `orca skills get orchestration` と、その guide が示す `references/coordinator-loop.md` を読む。実際の executable は orchestration Skill の解決規則に従う。以下の `orca` は今回確認したローカル executable の例。

```sh
orca --version
orca orchestration worker-start --help
orca skills get orchestration --reference references/coordinator-loop.md
```

確認した公開契約:

- 新規 Codex worker は `--agent codex --model gpt-6.1-sol --effort medium` を受け付ける。`--effort` は `--model` が必要で、どちらも既存 `--terminal` の再利用とは併用不可。
- 新規 worker は仲介 agent にさらに reviewer を spawn させるのではなく、**その worker 自身を read-only reviewer** とする。Task spec に repo、Package、Superpowers template、repo review Skill の読み方、編集・追加 subagent 禁止、出力契約を含める。
- guide は receipt の `launch.requested` と `launch.effective` の比較を要求する。effective が不明、または worker が別の reviewer を起動した場合は reviewer 本体の model / effort を保証できない。
- 同梱 `out/shared/agent-session-option-catalog-claude-codex.js` の `codexEffort().apply.launchArgs` は effort を `-c model_reasoning_effort=<値>` に変換する。これは起動された Codex 本体への経路を裏付けるが、別の child reviewer への継承を保証しない。
- worker-start の公開 option に sandbox の指定はない。read-only の指示と実際の権限を確認する。read-only や reviewer 本体の実効設定を確認できない経路は下の直接起動へ切り替える。

同じ reviewer worker / context を再開でき、各回の実効設定と context の一致を receipt 等で確認できる場合は、その worker を再 review に使う。継続性を確認できない場合は継続不能の理由を記録して、fresh context の直接起動へ切り替える。

Orca の UI 標準 review や仲介 agent の review effort 設定が、child reviewer 本体まで適用されることは今回の確認では保証できない。UI 設定だけを根拠に標準構成と称さない。Orca worker を実際に dispatch する場合の Run / receipt / worker_done / release は version-matched guide に従う。今回 worker dispatch の実測は行っていない。

## 保証できない場合の代替: Codex CLI 直接起動

以下を標準の代替とする。追加 adapter script は不要で、CLI option とレビュー用 prompt の組み合わせを薄い adapter とする。初回は新規 `codex exec` に Package と template を割り当てた prompt だけを渡す。実装者の session の resume / fork や実装会話を使わない。再 review 用に reviewer の session を保存し、header の session ID を repo 外へ記録する。

```sh
codex --version
codex exec --help
codex exec --ignore-user-config \
  --model gpt-6.1-sol \
  -c 'model_reasoning_effort="medium"' \
  --sandbox read-only \
  --cd /absolute/path/to/anime-prompt \
  --output-last-message /tmp/anime-prompt-review-verdict.txt \
  - < /tmp/anime-prompt-review-prompt.txt
```

path は対象 repo と今回の一時ファイルに置き換える。`--ignore-user-config` は個人 config の MCP 等を読み込まない。`--ephemeral` は使わず、同じ reviewer session を再開できるようにする。auth は CLI の既存設定を使い、Credential は prompt / Package に渡さない。repo の `AGENTS.md` は引き続き読む。Superpowers は環境から読み、prompt 内に template の実パスを明示する。

### 同じ reviewer / context での再 review

Codex CLI 0.159.2 の実起動で、以下の `resume` が初回と同じ session ID を返し、前回の文脈を保持し、model / effort / sandbox が標準構成に一致することを確認した。

```sh
codex exec --ignore-user-config \
  --sandbox read-only \
  --cd /absolute/path/to/anime-prompt \
  resume --model gpt-6.1-sol \
  -c 'model_reasoning_effort="medium"' \
  --output-last-message /tmp/anime-prompt-rereview-1-verdict.txt \
  REVIEWER_SESSION_ID - < /tmp/anime-prompt-rereview-1-prompt.txt
```

`REVIEWER_SESSION_ID` は記録した reviewer 本体の ID に置き換える。`--last` は使わず、実装者や別の reviewer の session を選ばない。prompt は更新済み Package、前回 finding、修正差分、最新 verify を指定し、finding の解消と回帰の確認を依頼する。前回 verdict と launch 記録も repo 外に保持する。以前の ephemeral session 等を再開できなければ、継続不能の理由を Package に記して新しい fresh context でレビューをやり直す。reviewer の変更で最大3回の再 review 回数をリセットしない。

launcher が各回の起動 header の **model: gpt-6.1-sol / reasoning effort: medium / sandbox: read-only** を requested と照合し、effective 値・header による確認方法・一致判定・session ID を CLI 終了コードと最終 verdict と一緒に保存する。再開時も実効値を照合し、前回と同じ session ID であることを確認する。一致しない review は採用せず、設定と起動経路を確定する。header は実起動設定の証拠であり、モデル内部の計算量の証明ではない。verdict file は毎回新しい path を使い、古い PASS を拾わない。終了コード0だけでは PASS にならず、review Skill の判定条件を満たす最終報告が必要。

CLI の read-only sandbox は shell 書き込みを制限する。prompt でも修正・commit・push・PR 作成・外部 mutation・追加 subagent を禁止する。write 権限への昇格や sandbox bypass はしない。途中で起動失敗・設定不一致・不足情報があれば停止し、保証できる範囲と制約を記録する。
