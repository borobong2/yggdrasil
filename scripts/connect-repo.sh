#!/usr/bin/env bash
# Connect a GitHub repo to Yggdrasil ticket tracking (YG-24).
#
#   scripts/connect-repo.sh <owner/repo> <PREFIX> [START]
#   e.g. scripts/connect-repo.sh borobong2/yggdrasil YG 24
#
# 1. Reads the webhook secret from GCP Secret Manager (personal config) — never printed.
# 2. Creates (or updates) the repo webhook with your local `gh` auth:
#    push, pull_request, check_suite, workflow_run, deployment_status → <app>/api/webhooks/github.
# 3. Registers the repo + prefix in Yggdrasil with the Claude PAT from the Keychain (yggdrasil-claude-pat).
#    START (optional) makes the next allocated key at least PREFIX-START.
# Company repositories are refused.
set -euo pipefail

APP_URL="${YGGDRASIL_URL:-https://yggdrasil-539022479969.asia-northeast3.run.app}"
GCP_PROJECT=yggdrasil-ws
PAT_ITEM=yggdrasil-claude-pat
BLOCKED_OWNERS=(creatived-digital-lab)

die() { echo "connect-repo: $*" >&2; exit 1; }

repo="${1:-}"; prefix="${2:-}"; start="${3:-}"
[[ "$repo" =~ ^[A-Za-z0-9-]+/[A-Za-z0-9._-]+$ && "$prefix" =~ ^[A-Za-z][A-Za-z0-9]{0,9}$ ]] || die "usage: $0 <owner/repo> <PREFIX> [START]"
[[ -z "$start" || "$start" =~ ^[1-9][0-9]{0,5}$ ]] || die "START must be a positive integer"
owner="$(printf %s "${repo%%/*}" | tr '[:upper:]' '[:lower:]')"
for blocked in "${BLOCKED_OWNERS[@]}"; do [[ "$owner" != "$blocked" ]] || die "refusing: $owner is a company organization"; done
prefix="$(printf %s "$prefix" | tr '[:lower:]' '[:upper:]')"
hook_url="$APP_URL/api/webhooks/github"

command -v gh >/dev/null || die "gh CLI not found"
gh auth status >/dev/null 2>&1 || die "gh is not logged in (gh auth login)"

secret="$(CLOUDSDK_ACTIVE_CONFIG_NAME=personal gcloud secrets versions access latest --secret GITHUB_WEBHOOK_SECRET --project "$GCP_PROJECT")"
[[ "$secret" =~ ^[A-Za-z0-9]{32,}$ ]] || die "GITHUB_WEBHOOK_SECRET is missing or not alphanumeric (see docs/deploy/README.md)"
pat="$(security find-generic-password -s "$PAT_ITEM" -w 2>/dev/null)" || die "Keychain item $PAT_ITEM not found (run scripts/connect-mcp.sh)"

# The secret only travels on stdin (printf is a builtin), never in argv or the terminal.
hook_body() {
  printf '{"name":"web","active":true,"events":["push","pull_request","check_suite","workflow_run","deployment_status"],"config":{"url":"%s","content_type":"json","insecure_ssl":"0","secret":"%s"}}' "$hook_url" "$secret"
}
existing="$(gh api "repos/$repo/hooks" --jq ".[] | select(.config.url == \"$hook_url\") | .id" | head -n1)"
if [[ -n "$existing" ]]; then
  hook_body | gh api -X PATCH "repos/$repo/hooks/$existing" --input - >/dev/null
  echo "✓ webhook updated ($repo, id $existing)"
else
  hook_body | gh api -X POST "repos/$repo/hooks" --input - >/dev/null
  echo "✓ webhook created ($repo → $hook_url)"
fi

body="{\"fullName\":\"$repo\",\"prefix\":\"$prefix\"${start:+,\"start\":$start}}"
code="$(printf 'header = "Authorization: Bearer %s"\n' "$pat" | curl -sS -K - -o /dev/null -w '%{http_code}' \
  -X POST "$APP_URL/api/github/repos" -H 'Content-Type: application/json' -d "$body")"
[[ "$code" == 201 ]] || die "Yggdrasil API returned HTTP $code"
echo "✓ Yggdrasil: $repo → ${prefix}-n${start:+ (next ≥ $prefix-$start)}"
echo "  GitHub sends a ping now; check 설정 → GitHub 연결 for the last event."
