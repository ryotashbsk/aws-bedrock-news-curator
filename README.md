# AWS Bedrock News Curator

## 概要

フロントエンド、バックエンド、AI の公式一次情報を収集し、AWS Bedrock で要約の上、Slack に投稿する。
ニュース記事、個人ブログ、SNS などの二次情報は対象外。

主な構成:

- EventBridge Scheduler: 毎日 08:00 JST に Lambda を起動
- Lambda: 公式 URL 取得、Bedrock 要約、HTML 生成、S3 アップロード、Slack 投稿、通知履歴保存
- S3: 日次 HTML を静的公開
- DynamoDB: 通知済み URL の重複排除
- Secrets Manager: Slack Incoming Webhook URL
- Bedrock: `bedrockModelId` で指定したモデルを利用

## 実行の流れ

1. `config/news-sources.json` からカテゴリと巡回対象 URL を読み込む
2. `agents/*.md` のカテゴリ別編集方針を読み込む
3. RSS / Atom / HTML から候補トピックを抽出
4. DynamoDB の通知履歴を使い、通知済み URL を除外
5. 候補と編集方針を Bedrock に渡し、JSON 形式の要約結果を得る
6. 候補 URL に存在しない `officialLink` を除外
7. 日次 HTML を S3 にアップロード
8. Slack に注目トピックと HTML URL を投稿
9. 投稿成功後、採用 URL を DynamoDB に保存

## 通知内容

HTML には3カテゴリ分のニュースをまとめて掲載する。
候補ソースが英語でも、表示するタイトルと要約は日本語に翻訳・要約する。
サービス名、会社名、API 名、モデル名などの固有名詞は原語のまま残す。

各トピックに含める情報:

- タイトル
- 要約
- 公式リンク

Slack には日次 HTML へのリンクと、カテゴリ横断の注目タイトルを最大5件だけ投稿する。

```text
━━━━━━━━━━━━━━━━━━━━
🚀 本日のTechニュース - 2026/06/28(日)
━━━━━━━━━━━━━━━━━━━━
■ 注目のトピックス：
・注目のトピックスのタイトル
・注目のトピックスのタイトル

■ 本日のニュース一覧：
http://example-bucket.s3-website-ap-northeast-1.amazonaws.com/news/2026/06/28/index.html
```

## ファイル構成

CDK:

- `bin/app.ts`: CDK app の入口
- `lib/news-curator-stack.ts`: Lambda、DynamoDB、S3、Secrets Manager、Scheduler、IAM Role などの AWS リソース定義
- `cdk.json`: CDK app 起動コマンドと context 設定

Lambda:

- `src/lambda/handler.ts`: Lambda の実行入口。収集、要約、HTML 生成、Slack 投稿、履歴保存をつなぐ
- `src/lambda/config.ts`: `config/news-sources.json` の読み込みと構造チェック
- `src/lambda/source-fetcher.ts`: RSS / Atom / HTML から候補トピックを抽出
- `src/lambda/bedrock-curator.ts`: Bedrock Converse API 呼び出し、プロンプト生成、JSON 応答の parse
- `src/lambda/news-html.ts`: `templates/news.html` を使って日次 HTML を生成
- `src/lambda/news-page-store.ts`: 生成した HTML を S3 にアップロード
- `src/lambda/slack.ts`: Slack メッセージ整形と送信
- `src/lambda/history-store.ts`: DynamoDB による通知履歴管理
- `src/lambda/secrets.ts`: Secrets Manager から Slack Webhook URL を取得
- `src/lambda/date.ts`: JST の日付表示と S3 key 用の日付部品を生成
- `src/lambda/url.ts`: URL 正規化
- `src/lambda/types.ts`: 設定、候補、要約結果などの型定義

設定・プロンプト:

- `config/news-sources.json`: カテゴリと公式ソース一覧
- `agents/frontend-news.md`: フロントエンドカテゴリの優先対象と選定基準
- `agents/backend-news.md`: バックエンドカテゴリの優先対象と選定基準
- `agents/ai-news.md`: AI カテゴリの優先対象と選定基準
- `templates/news.html`: S3 に公開する日次 HTML のテンプレート

テスト:

- `test/bedrock-curator.test.ts`: Bedrock 応答 JSON の parse とプロンプト内容のテスト
- `test/config.test.ts`: news config の parse / validation テスト
- `test/news-html.test.ts`: HTML 生成と escape のテスト
- `test/slack.test.ts`: Slack メッセージ生成のテスト
- `test/url.test.ts`: URL 正規化のテスト

生成物・ローカル環境:

- `cdk.out/`: `pnpm cdk:synth` の生成物。

## 初期設定

前提:

- AWS CLI が対象アカウントに認証済み
- CDK bootstrap 済み
- Bedrock で指定モデルが利用可能
- Slack Incoming Webhook 作成済み

初回の流れ:

```bash
pnpm install
pnpm whoami:aws
pnpm cdk bootstrap
pnpm check
pnpm cdk:deploy
```

このリポジトリの CDK 系 script は、`AWS_PROFILE` 未指定時に `bedrock-news-deploy` を使う。

## Slack Webhook 設定

`pnpm cdk:deploy` 後、Secrets Manager の `aws-bedrock-news-curator/slack-webhook` を次の JSON に更新する。

```json
{
  "webhookUrl": "https://hooks.slack.com/services/..."
}
```

CLI で更新する場合:

```bash
AWS_PROFILE=bedrock-news-deploy aws secretsmanager put-secret-value \
  --secret-id aws-bedrock-news-curator/slack-webhook \
  --secret-string '{"webhookUrl":"https://hooks.slack.com/services/..."}' \
  --region ap-northeast-1
```

## コマンド

| コマンド            | 役割                                                      |
| ------------------- | --------------------------------------------------------- |
| `pnpm install`      | 依存パッケージをインストール                              |
| `pnpm build`        | TypeScript の型チェック                                   |
| `pnpm lint`         | ESLint による静的解析                                     |
| `pnpm format:check` | Prettier の整形チェック                                   |
| `pnpm format`       | Prettier で自動整形                                       |
| `pnpm test`         | unit test 実行                                            |
| `pnpm check`        | build / lint / format:check / test / cdk:synth を順に実行 |
| `pnpm cdk:synth`    | CloudFormation template と Lambda bundle を生成           |
| `pnpm cdk:deploy`   | AWS へ CDK stack をデプロイ                               |
| `pnpm cdk`          | CDK CLI を直接実行                                        |
| `pnpm whoami:aws`   | AWS CLI の認証先を確認                                    |

通常の変更後:

```bash
pnpm check
pnpm cdk:deploy
```

最低限の確認だけでデプロイする場合でも、`pnpm build` と `pnpm cdk:synth` は先に実行する。

## 手動実行

```bash
AWS_PROFILE=bedrock-news-deploy aws lambda invoke \
  --function-name AwsBedrockNewsCuratorFunction \
  --region ap-northeast-1 \
  /tmp/news-curator-result.json

cat /tmp/news-curator-result.json
```

成功例:

```json
{
  "postedCategories": ["frontend", "backend", "ai"],
  "htmlUrl": "http://example-bucket.s3-website-ap-northeast-1.amazonaws.com/news/2026/06/28/index.html"
}
```

手動実行でも実際に Slack へ投稿される。
2回目以降は DynamoDB の通知履歴により、同じ URL が除外される。

## 変更反映

次のファイルを変更した場合は再デプロイが必要。

- `src/lambda/**/*.ts`
- `agents/*.md`
- `config/news-sources.json`
- `lib/news-curator-stack.ts`
- `cdk.json`

```bash
pnpm check
pnpm cdk:deploy
```

CDK deploy 時に Lambda bundle へ `src/lambda/`、`agents/`、`config/` が同梱される。
