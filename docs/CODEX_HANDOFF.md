# TRPG Scenario Manager 引き継ぎ資料

更新日: 2026-07-28

> この文書は2026-07-28時点の開発引き継ぎ記録です。現在の機能・手順はルートの`README.md`と実装を参照してください。

## プロジェクト

- リポジトリ: プロジェクトルート
- React版: `react-app/`
- 旧ローカル版の `index.html`・`app.js`・`styles.css` は移行元として保持し、変更しない
- 技術: React / Vite / TypeScript / Supabase

## 完了済み

### Phase 1

- React + Vite + TypeScript 構成
- Googleログイン用のSupabase Auth接続
- Repository / Service / Mapper / Domain / DTOの基本構成
- `typecheck`・`lint`・`format:check`・`build` 成功

### Phase 2

- Googleログイン
- ログアウト
- セッション復元
- 初回ログイン時の `profiles` 自動作成
- プロフィール表示名の更新
- share_code表示・検索

### Phase 3

- シナリオ一覧
- シナリオ詳細
- シナリオ登録
- シナリオ削除
- シナリオ基本編集
- シナリオ本体の詳細編集

現在、編集できる項目:

- タイトル、システム、作者
- 対応版、舞台、シナリオ種別
- 人数、プレイ時間
- 推奨技能、準推奨技能、非推奨
- ロスト率、ロスト率補足
- HO形式、戦闘
- 注意事項、トレーラー

## Supabaseの状態

適用済みマイグレーション:

- `supabase/migrations/20260728000000_initial_schema.sql`
- `supabase/migrations/20260728000001_rls.sql`
- `supabase/migrations/20260728000003_create_scenario_rpc.sql`

未適用または保留:

- `20260728000002_storage_policies.sql`

Storageの管理テーブルはSupabase管理下のため、SQL EditorからStorageポリシーを作成する際に所有者権限エラーが発生した。バケット `avatars` と `scenario-images` は作成済み。Storage画像機能を実装する段階で、Supabase Dashboardからポリシーを設定する。

シナリオ登録はRLSの直接INSERTではなく、`public.create_scenario()` RPCを使用する。RPC内で `auth.uid()` と所有者IDを検証している。

## 主要ファイル

```text
react-app/src/app/App.tsx
react-app/src/services/ScenarioService.ts
react-app/src/repositories/scenario/ScenarioRepository.ts
react-app/src/repositories/scenario/ScenarioMapper.ts
react-app/src/repositories/profile/ProfileRepository.ts
react-app/src/repositories/auth/AuthRepository.ts
react-app/src/domain/models/
react-app/src/domain/commands/
react-app/src/domain/dto/
react-app/src/lib/supabase/
```

## アーキテクチャ規則

```text
Page
 ↓
Service
 ↓
Repository（内部でMapperを利用）
 ↓
Supabase
```

- PageはSupabaseを直接呼ばない
- Serviceはユースケース、入力検証、Saga、AppError変換を担当
- RepositoryはDB・Storage・Auth・RPCアクセスを担当
- MapperはDB RowとDomain Modelの変換を担当
- DTOはServiceで作成する
- 旧版ファイルは変更しない

## 次に進める内容

優先順:

1. HOの追加・編集・削除
2. シナリオ画像のアップロード・削除・表示
3. Storageポリシーの設定
4. エピソードの追加・編集・削除
5. お気に入り・KP状態・通過状態・メモの編集
6. 共有機能
7. JSONバックアップのインポート・エクスポート

## ローカル起動

```bash
cd react-app
npm run dev
```

ブラウザ:

- `http://localhost:5173/`
- `http://localhost:5173/scenarios`
- `http://localhost:5173/scenarios/new`

## 確認コマンド

```bash
cd react-app
npm run format:check
npm run typecheck
npm run lint
npm run build
```

## 次のチャットへの依頼例

```text
docs/CODEX_HANDOFF.md を確認して、未完了のPhaseを引き継いでください。
既存の旧版ファイルは変更せず、まずHO機能の設計と実装状況を確認してください。
```
