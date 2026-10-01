# Issue #4: 共通 verify と GitHub CI の設計

対象: [Issue #4](https://github.com/k-hakiri/anime-prompt/issues/4)

仕様正本: [Notion](https://app.notion.com/p/3eb4daebe6d481548d93c55b3fdf5cbe?pvs=204)

## 目的と範囲

ローカル Agent と GitHub Actions が同じ品質ゲートを使い、独立 review
PASS 後の PR を CI で再検証する。Issue #4 の Acceptance Criteria を対象とし、
AniList 取得、特徴量生成、推薦、バッチ、benchmark は後続 Issue に残す。

2026-10-01 に Issue 本文、Parent #1、後続 #7・#8、Notion 正本を確認した。
正本は言語を実装時に決める方針で、GUI・DB サーバーを要求しない。
ユーザーは TypeScript・Node.js 24 LTS・npm、共通 verify、最小 CLI、
PR CI、文書更新の構成を承認済み。

## ツールチェーン

TypeScript と Node.js 24 LTS、npm を採用する。既存環境に Node.js と npm があり、
JSON を扱う CLI の型検査を追加できる。Python と uv はデータ処理に適するが、
この環境では追加の runtime・依存管理導入が必要になる。
JavaScript のみでは依存を減らせるが、後続のデータ契約の型検査を弱める。

Node.js の具体的な 24.x バージョンを `.node-version` に固定し、CI も同じ値を読む。
npm の使用バージョンとセットアップ手順を README に記載する。
開発依存は `package-lock.json` で固定し、ローカル・CI とも `npm ci` で導入する。
Node.js の native TypeScript 実行に適合する構文だけを使い、型検査は
`tsc --noEmit` で別途行う。配布用 build は今回追加しない。

開発ツールは Prettier、ESLint と TypeScript 用設定、TypeScript、Node 型定義に限定する。
unit test は Node.js 標準の test runner を使い、追加 test framework は導入しない。
本体の API SDK と runtime 依存は後続 Issue で必要になった時点で追加する。

## 共通品質ゲート

唯一の verify 入口は `npm run verify` とし、README、dev Skill、CI で完全に一致させる。
次の工程を順に実行し、最初の失敗で非0終了する。

1. Prettier の format check。コード・設定・公開文書を確認する。
2. ESLint の lint。TypeScript のコードとテストを確認する。
3. `tsc --noEmit` の strict 型検査。コードとテストを対象とする。
4. Node.js test runner による unit test。
5. 別プロセスから実際の CLI を起動する smoke test。

format check は書き換えず、整形用コマンドは別に用意する。
テストが0件の状態を成功と扱わず、対象の test ファイルを明示する。
後続 Issue のコード・テストは同じ設定と verify 入口へ追加する。

## 最小 CLI とテスト

`src/cli/main.ts` を共通の CLI 入口として、`--help` と不正引数の扱いだけを用意する。
実行例は `node src/cli/main.ts --help` とする。
ヘルプは stdout、診断は stderr へ出す。不正引数や引数なしの未実装操作は
非0終了し、成功した取得・推薦結果が存在するように見せない。
後続の `anime-fetch-anilist`、`anime-build-features`、`anime-recommend` の公開契約は
その実装 Issue で導入する。

小さい引数判定処理を unit test で検証する。smoke test では CLI を子プロセスで起動し、
`--help` の内容・終了コード0・空の stderr、不正引数の非0終了・空の stdout・
stderr の診断を確認する。timeout を設定し、停止しない CLI は失敗扱いにする。
テストに Secret、実取得データ、API 接続は必要ない。

## GitHub Actions

`.github/workflows/ci.yml` は `pull_request` で起動する。
権限は `contents: read` のみとし、API Secret を参照しない。
同じ PR の古い run は concurrency と `cancel-in-progress` でキャンセルする。
job には timeout を設ける。

checkout、固定した Node.js のセットアップ、`npm ci`、`npm run verify` を実行する。
利用する Actions は実在する commit SHA に固定する。
通常テストはローカル処理と fixture/mock で完結し、AniList・Jev・OpenAI へ接続しない。
依存インストールを除き、API 呼び出しを CI の成功条件にしない。

## 文書と公開 repo の保護

README にツールチェーンの選定理由、セットアップ、verify、最小 CLI の使用方法、
後続 Issue との境界を記載する。dev Skill は PR 前の verify を同じコマンドに更新する。
`.gitignore` に `node_modules/`、coverage、build、言語のキャッシュを追加し、
既存の Secret・raw・features・results・個人メモの保護を維持する。

AGENTS.md、dev Skill、README の Issue #2・#3 に対する bootstrap merge 例外を削除する。
すべての PR で CI 成功を必須とする。Branch Protection の required status check 設定は、
人間が GitHub 上で行う手順として README に記載し、repo の CI 実装と分ける。

## 検証と引き渡し

固定した Node.js とクリーンな依存インストールで `npm run verify` を実行する。
format、lint、型検査、unit test、smoke test の失敗が verify の非0終了へ伝わることも
一時的な変更で確認し、変更はすべて戻す。
`git diff --check`、全差分と追跡ファイル、ignore の保護対象と公開ファイルを確認する。

local verify 後に、固定 head を対象とする fresh context の独立 read-only review を行う。
reviewer 本体の `gpt-6.1-sol` / `medium` / read-only の実効値を起動記録で確認する。
blocking と判断に必要な cannot verify が残れば PR は作らない。
Issue の実装依頼にはその範囲の commit / push / PR 作成・更新 / CI 確認までを含み、
local verify と有効な独立 review の PASS 後は追加確認なしで進める。
ユーザーの明示した操作制限は優先する。merge はユーザーから明示的に指示された場合のみ、
最新 head の CI 成功を確認してから実行する。指示がなければ PR と CI の結果を報告して終了する。

## 参照

- [Node.js の release schedule](https://nodejs.org/en/about/previous-releases)
- [Node.js の TypeScript 実行](https://nodejs.org/api/typescript.html)
- [CLI の公開契約](../../../.codex/skills/anime-prompt-dev/references/contracts.md)
