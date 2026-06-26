#!/usr/bin/env bash
set -euo pipefail

STACK_NAME="${STACK_NAME:-aws-bedrock-news-curator-empty}"
AWS_PROFILE="${AWS_PROFILE:-bedrock-news-deploy}"
AWS_REGION="${AWS_REGION:-ap-northeast-1}"
TEMPLATE_FILE="${TEMPLATE_FILE:-cloudformation/empty-deploy.yaml}"

aws cloudformation deploy \
  --profile "$AWS_PROFILE" \
  --stack-name "$STACK_NAME" \
  --template-file "$TEMPLATE_FILE" \
  --region "$AWS_REGION" \
  --no-fail-on-empty-changeset
