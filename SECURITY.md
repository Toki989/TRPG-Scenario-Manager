# Security Policy

## Reporting a vulnerability

公開後に脆弱性を見つけた場合は、GitHubのPrivate vulnerability reportingが有効なら、公開Issueではなくそちらから報告してください。機密情報、認証情報、個人データ、再現用の実データを公開Issueへ投稿しないでください。

## Secrets and local state

次のファイルはリポジトリへコミットしません。

- `.env`、`.env.local`などのローカル環境変数
- `supabase/.temp/`以下のSupabase CLI作業ファイル
- Supabaseのサービスロールキーとデータベースパスワード
- 利用者が出力したバックアップJSON

フロントエンドに設定するのは、Supabaseの公開用URLとpublishable keyだけです。データの認可は公開キーの秘匿性ではなく、データベースのRLSとStorageポリシーで行います。

## Dependency audit note

React Router 7.18.2に対して、`npm audit`はRSCモードのCSRFに関する`GHSA-qwww-vcr4-c8h2`を報告します。このアプリはViteによるクライアントサイドSPAであり、勧告の対象となるunstable RSC APIを使用していません。通常のルーティングに関係する以前の勧告を避けるため、React Routerは7.18.2に更新しています。

RSCを導入する場合は、この判断を引き継がず、勧告の修正版へ更新してから利用してください。
