# Verify and GitHub CI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Issue #4 のローカル・PR CI 共通品質ゲートを構築する。

**Architecture:** npm scripts が各品質ゲートを順番に呼ぶ。最小 CLI とテストは Node.js の native TypeScript 実行を使い、CI は同じ verify を呼ぶ。アプリ機能は後続 Issue に残す。

**Tech Stack:** Node.js 24 LTS、npm、TypeScript、Prettier、ESLint、typescript-eslint、Node.js test runner。

**Spec:** [承認済み設計書](../specs/2026-10-01-verify-github-ci-design.md)

## Global Constraints

- 唯一の verify 入口は `npm run verify`。README・dev Skill・CI で完全一致させる。
- Node.js の具体的な 24.x バージョンを `.node-version` に固定する。
- 依存は `package-lock.json` に固定し、セットアップは `npm ci`。
- format、lint、strict typecheck、unit test、CLI smoke test を実行する。
- 配布用 build、API SDK、取得・特徴量生成・推薦ロジックを追加しない。
- テストに Secret、実取得データ、外部 API 接続は必要ない。
- PR 前に local verify と fresh context の独立 read-only review を必須とする。
- reviewer は repo 契約の `gpt-6.1-sol` / `medium` / read-only を使う。
- CI 成功前に merge しない。PR 作成・merge はセッションの許可範囲に従う。

## Review Focus

- 空引数・未知引数・`--help` と余分な引数の組み合わせが成功扱いにならないこと。Task 1 の unit/smoke test で固定する。
- 子プロセスの stdout/stderr と終了コードが CLI の意図に一致すること。Task 1 の smoke test で確認する。
- 新規 test ファイルが実行対象から漏れないこと。Task 1 で unit/smoke のディレクトリに分け、Task 2 で一時 test を追加して確認する。
- 各品質ゲートの失敗が verify の非0終了に伝わること。Task 2 で一時変更による失敗注入を確認する。
- lockfile・runtime の不一致や CI の未実行を成功と扱わないこと。Task 2 の clean install と設定確認、独立レビュー、PR 後の当該 head の CI 確認で扱う。

## Task 1: 型検査可能な最小 CLI と共通 verify

**Files:**

- Create: `package.json`, `package-lock.json`, `.node-version`, `tsconfig.json`, `eslint.config.js`, `.prettierignore`, `.prettierrc.json`
- Create: `src/cli/args.ts`, `src/cli/main.ts`
- Test: `tests/unit/args.test.ts`, `tests/smoke/cli.test.ts`
- Modify: `.gitignore`

**Interfaces:**

- Consumes: `process.argv.slice(2)` の `string[]`。
- Produces: `parseArgs(args: readonly string[]): 'help' | 'invalid'` を `src/cli/args.ts` から export。
- Produces: `node src/cli/main.ts --help`、`npm run verify`、整形用 `npm run format`。
- Produces: `npm run test:unit` と `npm run test:smoke`。各ディレクトリの `.test.ts` をすべて実行する。

- [ ] **Step 1: Node.js 24 の実在する安定版を確認し固定する。** `.node-version` の値でローカルを起動し、`node --version` と `npm --version` を記録する。既存の Issue 用 worktree を再利用する。
- [ ] **Step 2: package と品質ゲート設定を作る。** ESM と strict TypeScript を使い、native TypeScript に不適合な構文を型検査で禁止する。format/lint/typecheck/test:unit/test:smoke を `&&` で結ぶ verify を定義する。開発依存を固定して lockfile を生成し、`node_modules/`・coverage・build・TypeScript cache を ignore する。
- [ ] **Step 3: 引数判定の failing unit test を書く。** `['--help']` のみが `'help'`、`[]`, `['--unknown']`, `['--help', 'extra']` が `'invalid'` と assert する。
- [ ] **Step 4: `npm run test:unit` を実行する。** Expected: `args.ts` 未実装による失敗。
- [ ] **Step 5: `parseArgs(args: readonly string[]): 'help' | 'invalid'` を実装する。** 正確に1個の `--help` のみを受け入れる。
- [ ] **Step 6: `npm run test:unit` を実行する。** Expected: 全 unit test が PASS。
- [ ] **Step 7: failing smoke test を書く。** `spawnSync(process.execPath, ['src/cli/main.ts', ...args], { timeout: 5000 })` を使う。help は status 0、stdout に usage、stderr 空。空引数・未知引数・help と余分な引数は非0 status、stdout 空、stderr に診断。spawn error は失敗として assert する。
- [ ] **Step 8: `npm run test:smoke` を実行する。** Expected: `main.ts` 未実装で help の成功条件が失敗。
- [ ] **Step 9: CLI 入口を実装する。** help を stdout、invalid の診断を stderr に出し、invalid の `process.exitCode` を 2 にする。ヘルプに本体未実装であることと後続 Issue の境界を示す。
- [ ] **Step 10: 整形後に `npm run verify` を実行する。** Expected: format/lint/typecheck/unit/smoke の全工程が終了コード0。
- [ ] **Step 11: 検証済みの Task 1 を commit する。** `git diff --check` を確認してから、指定ファイルのみ stage する。

## Task 2: PR CI と運用文書

**Files:**

- Create: `.github/workflows/ci.yml`
- Modify: `README.md`, `AGENTS.md`, `.codex/skills/anime-prompt-dev/SKILL.md`
- Modify as needed: Task 1 の設定ファイル（失敗注入で問題が見つかった場合のみ）

**Interfaces:**

- Consumes: Task 1 の `.node-version`、`package-lock.json`、`npm run verify`。
- Produces: PR で走る `verify` job、README のセットアップ・人間による required check 設定手順、共通 verify を要求する dev Skill。

- [ ] **Step 1: workflow を作る。** `pull_request`、`contents: read`、PR 番号を含む concurrency group、`cancel-in-progress: true`、10分の job timeout を設定する。checkout/setup-node は実在する SHA に固定し、`.node-version` を読み、`npm ci` と `npm run verify` を実行する。Secret 参照は追加しない。
- [ ] **Step 2: README を更新する。** 選定理由、固定 runtime/npm、`npm ci`、`npm run verify`、整形コマンド、最小 CLI の実行例を記載する。GitHub の required check に `verify` を設定する人間作業を分離し、API key 不要・アプリ本体未実装を明記する。
- [ ] **Step 3: repo ルールを更新する。** AGENTS.md・dev Skill・README の bootstrap 例外を削除する。dev Skill の local verify を `npm run verify` に置き換え、当該 PR head の CI 成功を merge 条件として維持する。
- [ ] **Step 4: 各工程の失敗を一時変更で検証する。** 整形違反、unused variable、型不一致、unit assertion failure、smoke assertion failure を1つずつ注入し、各 `npm run verify` が非0終了することを記録する。毎回元に戻す。unit/smoke の各ディレクトリに一時 failing test を追加し、新規 test が検出されることも確認して削除する。
- [ ] **Step 5: clean install と最終 verify を実行する。** `npm ci`、`npm run verify`、`git diff --check`。Expected: 全コマンド終了コード0。全差分・追加ファイル・追跡対象・ignore と文書リンクを確認する。
- [ ] **Step 6: 検証済みの Task 2 と計画の完了状態を commit する。** 失敗注入の一時ファイルが残らないことを確認する。
- [ ] **Step 7: 独立レビューを実施する。** Issue・正本の必要範囲・全差分・固定 revision・検証結果を repo 外の Review Package にまとめる。repo review Skill と Superpowers reviewer template を使い、fresh context の read-only reviewer を起動し、本体 header の model/effort/sandbox を照合する。blocking があれば repo dev Skill の最大3回の修正・verify・再レビューに従う。
- [ ] **Step 8: レビュー済み差分を引き渡す。** PR 本文を repo 外に用意する。PR 作成の許可が未確定ならレビュー済み結果と本文を提示して確認する。許可済みなら push・PR 作成後に当該 head の CI を確認する。merge は自動実行しない。
