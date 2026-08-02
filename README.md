# TRPG Scenario Manager

TRPGシナリオを個人で整理・共有するためのWebアプリケーションです。現在のアプリ本体は、React、TypeScript、Vite、Supabaseで構成されています。

## 主な機能

- Googleアカウントによるログインとプロフィール管理
- シナリオの登録、編集、削除、検索、絞り込み
- キャンペーン、HO、セッション、参加キャラクターの管理
- トレーラー画像とキャラクター画像の保存
- お気に入り、KP・PL通過状況、個人メモの管理
- 共有コードを利用した閲覧共有
- JSONバックアップと復元
- Discord投稿用テキストの生成
- ライト、グレー、ダークテーマ

## 技術構成

- React 19
- TypeScript
- Vite
- React Router
- Supabase（Auth、PostgreSQL、Storage）

## ローカル起動

必要なもの:

- Node.js 20以降
- npm
- Supabaseプロジェクト

```bash
cd react-app
npm install
cp .env.example .env.local
```

`.env.local`にSupabaseプロジェクトの公開用接続情報を設定します。

```dotenv
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
```

サービスロールキーやデータベースパスワードは、ブラウザへ配信される`VITE_`環境変数に設定しないでください。

```bash
npm run dev
```

開発サーバーは通常 `http://localhost:5173` で起動します。

## Supabaseの準備

1. Supabaseプロジェクトを作成します。
2. `supabase/migrations/`のSQLをファイル名順に適用します。
3. Google認証を有効化し、開発・公開環境のリダイレクトURLを登録します。
4. `avatars`と`scenario-images`を非公開Storageバケットとして作成します。
5. Storageポリシーを含むマイグレーションが適用されていることを確認します。

RLS（Row Level Security）は、所有者と明示的な共有先だけが対象データを参照できる前提で設計されています。公開環境へ接続する前に、利用するSupabaseプロジェクト上でもポリシーを確認してください。

## 確認コマンド

```bash
cd react-app
npm run format:check
npm run typecheck
npm run lint
npm run build
npm audit
```

依存関係監査で報告される既知事項と、このアプリへの適用可否は[SECURITY.md](./SECURITY.md)に記録しています。

旧版バックアップとの互換性を確認する場合:

```bash
npm run verify:legacy -- /path/to/backup.json
```

## ディレクトリ構成

```text
react-app/            React版アプリケーション
supabase/migrations/  データベース・RLS・Storageポリシー
docs/                 開発資料
docx/                 初期仕様資料の記録
index.html            旧ローカル版（移行元）
app.js                旧ローカル版（移行元）
styles.css            旧ローカル版（移行元）
```

詳細な初期仕様は[SPECIFICATION.md](./SPECIFICATION.md)を参照してください。実装が進んでいるため、現在の挙動についてはReact版のコードとSupabaseマイグレーションを優先してください。

## 公開時の注意

- `.env.local`と`supabase/.temp/`はコミットしません。
- Supabaseのサービスロールキー、データベースパスワード、個人のバックアップJSONを公開しません。
- 本番環境ではSupabase Authの許可URLとStorageバケットの公開設定を再確認してください。
