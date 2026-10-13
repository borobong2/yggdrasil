#!/usr/bin/env bash
# YG-29 morning briefing: Telegram secrets + Cloud Scheduler job, in the owner's PERSONAL GCP project.
#
#   CLOUDSDK_ACTIVE_CONFIG_NAME=personal scripts/briefing-setup.sh <PROJECT_ID>
#
# Asks for TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, BRIEFING_OWNER_ID (hidden input on a terminal, one line each when piped).
# Empty answer keeps the existing secret. BRIEFING_SECRET is generated once and reused.
# Then creates/updates the scheduler job. Run scripts/deploy.sh <PROJECT_ID> afterwards so Cloud Run picks up the secrets.
# Runbook: docs/deploy/briefing.md
set -euo pipefail

REGION=asia-northeast3
JOB=yggdrasil-briefing
URL="${BRIEFING_URL:-https://yg.justrunlab.com}/api/briefing/run"
SCHEDULE='*/30 6-23 * * *' # every 30 min, 06:00–23:30 Asia/Seoul

die() { echo "briefing-setup: $*" >&2; exit 1; }

PROJECT_ID="${1:-}"
[[ -n "$PROJECT_ID" ]] || die "usage: $0 <PROJECT_ID>"

# Same guard as deploy.sh: the machine's default gcloud config is a company account.
account="$(gcloud config get-value account 2>/dev/null || true)"
active_project="$(gcloud config get-value project 2>/dev/null || true)"
[[ -n "$account" ]] || die "no active gcloud account (activate the 'personal' configuration)"
[[ "$account" != *@creatived.kr ]] || die "refusing: active account $account is a company account"
[[ "$PROJECT_ID" != sokind-ai && "$active_project" != sokind-ai ]] || die "refusing: sokind-ai is a company project"
echo "briefing-setup: account=$account project=$PROJECT_ID"

g() { gcloud --project "$PROJECT_ID" --quiet "$@"; }
deploy="$(dirname "$0")/deploy.sh"
has_secret() { g secrets describe "$1" >/dev/null 2>&1; }

for name in TELEGRAM_BOT_TOKEN TELEGRAM_CHAT_ID BRIEFING_OWNER_ID; do
  if [[ -t 0 ]]; then read -rsp "$name (empty = keep): " value; echo >&2; else IFS= read -r value || true; fi
  if [[ -z "$value" ]]; then
    has_secret "$name" || die "$name is required (no existing secret)"
    echo "briefing-setup: $name kept"
    continue
  fi
  if [[ "$name" == BRIEFING_OWNER_ID && ! "$value" =~ ^[0-9a-fA-F-]{36}$ ]]; then die "BRIEFING_OWNER_ID must be a UUID"; fi
  # printf is a builtin: the value never shows up in ps or the terminal.
  printf %s "$value" | "$deploy" "$PROJECT_ID" secret "$name" >/dev/null
  echo "briefing-setup: $name updated"
done
unset value

if ! has_secret BRIEFING_SECRET; then
  openssl rand -hex 32 | "$deploy" "$PROJECT_ID" secret BRIEFING_SECRET >/dev/null
  echo "briefing-setup: BRIEFING_SECRET generated"
fi
secret="$(g secrets versions access latest --secret BRIEFING_SECRET)"

g services enable cloudscheduler.googleapis.com
# ponytail: the header value is passed as a gcloud argument (briefly visible in this Mac's ps) and stored in the job config,
# readable by project viewers. Fine for a single-owner personal project; switch to OIDC if others get project access.
common=(--location "$REGION" --schedule "$SCHEDULE" --time-zone Asia/Seoul --uri "$URL" --http-method POST --attempt-deadline 60s)
if g scheduler jobs describe "$JOB" --location "$REGION" >/dev/null 2>&1; then
  g scheduler jobs update http "$JOB" "${common[@]}" --update-headers "X-Briefing-Secret=$secret" >/dev/null
  echo "briefing-setup: scheduler job $JOB updated"
else
  g scheduler jobs create http "$JOB" "${common[@]}" --headers "X-Briefing-Secret=$secret" >/dev/null
  echo "briefing-setup: scheduler job $JOB created"
fi
unset secret

cat <<EOF

Next:
  scripts/deploy.sh $PROJECT_ID                                   # Cloud Run picks up the new secrets
  gcloud --project $PROJECT_ID scheduler jobs run $JOB --location $REGION   # one run now (sends only after send_time)
  Settings › 아침 브리핑 › 지금 테스트 보내기                      # forced test message
EOF
