# AWS Bedrock News Curator

AWS Bedrock で公式一次情報を要約し、Slack に平日朝のニュース通知を投稿する CDK TypeScript プロジェクト。

## 目的

平日朝に、フロントエンド、バックエンド、AI の公式一次情報を収集し、チームに共有する価値がある更新だけを Slack に投稿する。
ニュース記事、個人ブログ、SNS などの二次情報は使わず、公式 Changelog、Release notes、Blog、Docs、GitHub Releases などを対象にする。

## 全体像

このプロジェクトは、AWS 上に定期実行のニュース収集・要約・通知基盤を作成する。

- EventBridge Scheduler: 平日 08:00 JST に Lambda を起動
- Lambda: 公式 URL 取得、Bedrock 要約、Slack 投稿、通知済み URL 保存を実行
- DynamoDB: 通知済み URL の重複排除
- Secrets Manager: Slack Incoming Webhook URL
- Bedrock: Amazon Nova 系 inference profile / モデルを環境変数で指定

既存の `agents/*.md` は、カテゴリごとの編集方針として Lambda から読み込む。

- `agents/frontend-news.md`: フロントエンド、Web プラットフォーム、UI 開発ツール
- `agents/backend-news.md`: バックエンド、クラウド、データベース、API 開発ツール
- `agents/ai-news.md`: AI サービス、開発支援 AI ツール

公式ソース一覧は `config/news-sources.json` に定義する。カテゴリごとに `agentPromptPath` と巡回対象 URL を持つ。

## 実行の流れ

1. EventBridge Scheduler が平日 08:00 JST に Lambda を起動
2. Lambda が `config/news-sources.json` を読み込み、カテゴリ一覧を取得
3. 各カテゴリの `agents/*.md` を読み込み、Bedrock に渡す編集方針として使用
4. カテゴリごとの公式 URL を取得
   - RSS / Atom は item / entry から候補を抽出
   - HTML は同一ドメイン内リンクから候補を抽出
   - 各取得処理は 10 秒でタイムアウト
5. URL を正規化し、DynamoDB に保存済みの URL を除外
6. 残った候補とカテゴリ指示を Bedrock Converse API に渡す
7. Bedrock の JSON 応答を検証
   - 必須フィールドが欠ける候補は失敗扱い
   - 候補 URL に存在しない `officialLink` は投稿対象から除外
8. Slack メッセージをカテゴリ別に整形
   - フロントエンドニュース
   - バックエンドニュース
   - AIニュース
9. Slack Incoming Webhook に投稿
10. 投稿成功後、採用された URL を DynamoDB に保存

## 通知内容

Slack にはカテゴリ別に投稿する。各トピックには次の情報を含める。
候補ソースが英語でも、Slack に表示するタイトル、要約、説明文は日本語に翻訳・要約して投稿する。
サービス名、会社名、API 名、モデル名などの固有名詞は原語のまま残す。

- 要約
- 何が変わったか
- エンジニア向けの活用イメージ
- 非エンジニア向けの活用イメージ（AI カテゴリで使用）
- 導入方法
- 注意点・制約
- 公式リンク

投稿は次の 2 セクション構成。

- 今日の最新情報
- 最近の重要アップデート（再掲）

Slack の長文制限に備え、メッセージが長い場合は分割して送信する。

## 重複排除

DynamoDB に `category` と `url` をキーとして通知済み URL を保存する。
次回以降の実行では、同じカテゴリで保存済みの URL は Bedrock に渡す前に除外する。

URL 正規化では、fragment と `utm_*`、`ref`、`source` などの追跡系 query を取り除く。

## セキュリティと運用上の前提

- Slack Webhook URL は Secrets Manager に保存し、環境変数やコードには書かない
- Lambda は Secret の読み取り、DynamoDB の読み書き、指定 Bedrock model の呼び出しだけを許可
- Bedrock IAM 権限は `bedrockModelId` で指定した inference profile / foundation model ARN に限定
- DynamoDB と Slack Secret は stack 削除時も保持
- Lambda log は 30 日保持
- EventBridge Scheduler は最大 2 回 retry
- Bedrock モデル ID は CDK context で差し替え可能

## 主要ファイル

- `lib/news-curator-stack.ts`: AWS リソース定義
- `src/lambda/handler.ts`: Lambda の実行入口
- `src/lambda/source-fetcher.ts`: RSS / HTML から候補トピックを抽出
- `src/lambda/bedrock-curator.ts`: Bedrock Converse API 呼び出しと応答検証
- `src/lambda/slack.ts`: Slack メッセージ整形と送信
- `src/lambda/history-store.ts`: DynamoDB による通知履歴管理
- `config/news-sources.json`: カテゴリと公式ソース一覧
- `agents/*.md`: カテゴリごとの編集方針

## AWS 側で必要な事前設定

デプロイ前に、AWS アカウント側で次を準備する。

### 1. AWS CLI 認証

AWS CLI で対象アカウントにログインする。

```bash
aws login
```

認証できているか確認。

```bash
aws sts get-caller-identity
```

プロファイルを使う場合は、以降のコマンドに `AWS_PROFILE` を付ける。

```bash
AWS_PROFILE=your-profile aws sts get-caller-identity
```

このリポジトリの `pnpm` scripts は、明示されていない場合に `AWS_PROFILE=bedrock-news-deploy` を使う。

```bash
pnpm whoami:aws
```

`Arn` が `assumed-role/AwsBedrockNewsCuratorDeployRole` になっていることを確認する。

direnv を使う場合は、リポジトリに入った時点で `.envrc` の値を読み込める。

```bash
direnv allow
```

`.envrc` では次を設定する。

```bash
AWS_PROFILE=bedrock-news-deploy
AWS_REGION=ap-northeast-1
CDK_DEFAULT_REGION=ap-northeast-1
```

### 2. デプロイ先リージョン

デフォルトは `ap-northeast-1`。
CDK 実行時は `CDK_DEFAULT_REGION` が未設定でも `ap-northeast-1` を使う。

明示する場合。

```bash
export AWS_REGION=ap-northeast-1
export CDK_DEFAULT_REGION=ap-northeast-1
```

### 3. CDK Bootstrap

初回だけ、対象アカウント・リージョンに CDK bootstrap を実行する。
これは Lambda のデプロイパッケージなどを置く CDK assets 用 S3 bucket / IAM role を作成するために必要。

```bash
pnpm cdk bootstrap
```

プロファイルを使う場合。

```bash
AWS_PROFILE=your-profile pnpm cdk bootstrap
```

### 4. Bedrock モデル利用設定

Bedrock で使用するモデルを対象リージョンで利用可能にする。
このプロジェクトの初期値は `apac.amazon.nova-pro-v1:0`。
`amazon.nova-pro-v1:0` は `ap-northeast-1` のオンデマンド直接呼び出しに対応していないため、APAC inference profile を使う。

```bash
pnpm cdk:deploy -- -c bedrockModelId=apac.amazon.nova-pro-v1:0
```

別モデルを使う場合は、利用可能な Bedrock model ID を指定する。

```bash
pnpm cdk:deploy -- -c bedrockModelId=amazon.nova-lite-v1:0
```

注意点:

- Bedrock の model access は AWS アカウント・リージョンごとに確認が必要
- 指定した model ID と CDK の `bedrockModelId` は一致させる
- Lambda の IAM 権限は `bedrockModelId` の inference profile と、その profile がルーティングする同一 foundation model ARN に限定される

### 5. Slack Incoming Webhook

Slack 側で Incoming Webhook を作成し、通知先チャンネルを選ぶ。
Webhook URL は README やコードに保存しない。

CDK deploy 後に Secrets Manager の `aws-bedrock-news-curator/slack-webhook` を更新する。

```bash
AWS_PROFILE=bedrock-news-deploy aws secretsmanager put-secret-value \
  --secret-id aws-bedrock-news-curator/slack-webhook \
  --secret-string '{"webhookUrl":"https://hooks.slack.com/services/..."}' \
  --region ap-northeast-1
```

プロファイルを使う場合。

```bash
AWS_PROFILE=your-profile aws secretsmanager put-secret-value \
  --secret-id aws-bedrock-news-curator/slack-webhook \
  --secret-string '{"webhookUrl":"https://hooks.slack.com/services/..."}' \
  --region ap-northeast-1
```

### 6. デプロイ実行ユーザーに必要な権限

CDK deploy を実行する IAM ユーザー / Role には、少なくとも次のリソースを作成・更新できる権限が必要。

- CloudFormation
- S3 assets（CDK bootstrap bucket）
- IAM Role / Policy
- Lambda
- EventBridge Scheduler
- DynamoDB
- Secrets Manager
- CloudWatch Logs

Lambda 実行 Role には CDK が次の権限を付与する。

- CloudWatch Logs 書き込み
- DynamoDB `DescribeTable` / `GetItem` / `PutItem`
- Secrets Manager read
- Bedrock `Converse` / `InvokeModel`

本番向けには、CDK deploy を実行する Role と、CDK が作成する実行用 Role を分ける。

CDK deploy を実行する Role の例。

```text
AwsBedrockNewsCuratorDeployRole
```

CDK が作成する実行用 Role。

```text
AwsBedrockNewsCuratorLambdaRole
AwsBedrockNewsCuratorSchedulerRole
```

このプロジェクトでは、本番向けに IAM policy の `Resource` を絞りやすくするため、主要リソース名を固定している。

```text
Lambda: AwsBedrockNewsCuratorFunction
DynamoDB: AwsBedrockNewsCuratorNotifiedUrls
LogGroup: /aws/lambda/AwsBedrockNewsCuratorFunction
Scheduler: AwsBedrockNewsCuratorWeekdayMorningSchedule
Secret: aws-bedrock-news-curator/slack-webhook
```

既にランダム名でデプロイ済みの stack にこの変更を適用すると、一部リソースは置き換えになる可能性がある。既存の本番データがある場合は、DynamoDB と Secrets Manager の保持状態を確認してから deploy する。

### 7. 本番向け CDK デプロイ Role の最小権限例

初回の `cdk bootstrap` は管理者権限で実行し、以降の deploy は `AwsBedrockNewsCuratorDeployRole` に切り替える運用を推奨。

`AwsBedrockNewsCuratorDeployRole` には、CDK bootstrap が作成する deploy / file publishing / lookup role を assume する権限を付与する。

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AssumeCdkBootstrapRoles",
      "Effect": "Allow",
      "Action": "sts:AssumeRole",
      "Resource": [
        "arn:aws:iam::<account-id>:role/cdk-hnb659fds-deploy-role-<account-id>-ap-northeast-1",
        "arn:aws:iam::<account-id>:role/cdk-hnb659fds-file-publishing-role-<account-id>-ap-northeast-1",
        "arn:aws:iam::<account-id>:role/cdk-hnb659fds-lookup-role-<account-id>-ap-northeast-1"
      ]
    },
    {
      "Sid": "ReadCloudFormation",
      "Effect": "Allow",
      "Action": [
        "cloudformation:DescribeStackEvents",
        "cloudformation:DescribeStacks",
        "cloudformation:GetTemplate",
        "cloudformation:ListStacks"
      ],
      "Resource": "*"
    }
  ]
}
```

bootstrap 側の CloudFormation execution policy は、今回の stack が作成・更新するリソースに限定する。
最初は次の範囲をベースにし、実運用の stack 名や account ID に合わせて調整する。

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "ManageProjectCloudFormationStack",
      "Effect": "Allow",
      "Action": [
        "cloudformation:CreateChangeSet",
        "cloudformation:CreateStack",
        "cloudformation:DeleteChangeSet",
        "cloudformation:DeleteStack",
        "cloudformation:DescribeChangeSet",
        "cloudformation:DescribeStackEvents",
        "cloudformation:DescribeStacks",
        "cloudformation:ExecuteChangeSet",
        "cloudformation:GetTemplate",
        "cloudformation:UpdateStack"
      ],
      "Resource": "arn:aws:cloudformation:ap-northeast-1:<account-id>:stack/AwsBedrockNewsCuratorStack/*"
    },
    {
      "Sid": "ManageLambda",
      "Effect": "Allow",
      "Action": [
        "lambda:AddPermission",
        "lambda:CreateFunction",
        "lambda:DeleteFunction",
        "lambda:GetFunction",
        "lambda:GetFunctionConfiguration",
        "lambda:RemovePermission",
        "lambda:TagResource",
        "lambda:UpdateFunctionCode",
        "lambda:UpdateFunctionConfiguration"
      ],
      "Resource": "arn:aws:lambda:ap-northeast-1:<account-id>:function:AwsBedrockNewsCuratorFunction"
    },
    {
      "Sid": "ManageProjectIamRoles",
      "Effect": "Allow",
      "Action": [
        "iam:CreateRole",
        "iam:DeleteRole",
        "iam:GetRole",
        "iam:PassRole",
        "iam:PutRolePolicy",
        "iam:DeleteRolePolicy",
        "iam:TagRole",
        "iam:UntagRole",
        "iam:UpdateAssumeRolePolicy"
      ],
      "Resource": [
        "arn:aws:iam::<account-id>:role/AwsBedrockNewsCuratorLambdaRole",
        "arn:aws:iam::<account-id>:role/AwsBedrockNewsCuratorSchedulerRole"
      ]
    },
    {
      "Sid": "ManageProjectDynamoDbTable",
      "Effect": "Allow",
      "Action": [
        "dynamodb:CreateTable",
        "dynamodb:DeleteTable",
        "dynamodb:DescribeTable",
        "dynamodb:TagResource",
        "dynamodb:UpdateTable"
      ],
      "Resource": "arn:aws:dynamodb:ap-northeast-1:<account-id>:table/AwsBedrockNewsCuratorNotifiedUrls"
    },
    {
      "Sid": "ManageProjectSecret",
      "Effect": "Allow",
      "Action": [
        "secretsmanager:CreateSecret",
        "secretsmanager:DeleteSecret",
        "secretsmanager:DescribeSecret",
        "secretsmanager:GetSecretValue",
        "secretsmanager:PutSecretValue",
        "secretsmanager:TagResource",
        "secretsmanager:UpdateSecret"
      ],
      "Resource": "arn:aws:secretsmanager:ap-northeast-1:<account-id>:secret:aws-bedrock-news-curator/slack-webhook-*"
    },
    {
      "Sid": "ManageProjectLogs",
      "Effect": "Allow",
      "Action": [
        "logs:CreateLogGroup",
        "logs:DeleteLogGroup",
        "logs:DescribeLogGroups",
        "logs:PutRetentionPolicy",
        "logs:TagResource"
      ],
      "Resource": "arn:aws:logs:ap-northeast-1:<account-id>:log-group:/aws/lambda/AwsBedrockNewsCuratorFunction"
    },
    {
      "Sid": "ManageProjectScheduler",
      "Effect": "Allow",
      "Action": [
        "scheduler:CreateSchedule",
        "scheduler:DeleteSchedule",
        "scheduler:GetSchedule",
        "scheduler:TagResource",
        "scheduler:UpdateSchedule"
      ],
      "Resource": "arn:aws:scheduler:ap-northeast-1:<account-id>:schedule/default/AwsBedrockNewsCuratorWeekdayMorningSchedule"
    },
    {
      "Sid": "ReadBedrockModels",
      "Effect": "Allow",
      "Action": ["bedrock:GetFoundationModel", "bedrock:ListFoundationModels"],
      "Resource": "*"
    }
  ]
}
```

CDK bootstrap の execution policy を指定する例。

```bash
aws iam create-policy \
  --policy-name AwsBedrockNewsCuratorCloudFormationExecutionPolicy \
  --policy-document file://cloudformation-execution-policy.json

pnpm cdk bootstrap \
  --cloudformation-execution-policies arn:aws:iam::<account-id>:policy/AwsBedrockNewsCuratorCloudFormationExecutionPolicy
```

## デプロイ手順

```bash
pnpm install
pnpm check
pnpm cdk:synth
pnpm cdk:deploy
```

デプロイ後、Secrets Manager の `aws-bedrock-news-curator/slack-webhook` を次の JSON に更新する。

```json
{
  "webhookUrl": "https://hooks.slack.com/services/..."
}
```

Bedrock モデルを変える場合は CDK context で指定。

```bash
pnpm cdk:deploy -- -c bedrockModelId=amazon.nova-lite-v1:0
```

## デプロイ後の確認

1. Secrets Manager の `aws-bedrock-news-curator/slack-webhook` に Slack Webhook URL を設定
2. Bedrock で指定モデルが利用可能か確認
3. Lambda を手動実行
4. Slack にカテゴリ別投稿が届くことを確認
5. Lambda を再実行し、同じ URL が再投稿されないことを確認

## AWS CLI 空デプロイ

AWS CLI の認証、リージョン、CloudFormation 権限だけを確認する場合は空スタックをデプロイ。

```bash
pnpm deploy:empty
```

環境変数でスタック名とリージョンを変更可能。

```bash
STACK_NAME=aws-bedrock-news-curator-empty AWS_REGION=ap-northeast-1 pnpm deploy:empty
```

## 品質チェック

```bash
pnpm check
```

`pnpm check` は TypeScript、ESLint、Prettier、unit test、CDK synth を順に実行。
