#!/usr/bin/env bash
# Deploy Yggdrasil to Cloud Run in the owner's PERSONAL GCP project.
#
#   CLOUDSDK_ACTIVE_CONFIG_NAME=personal scripts/deploy.sh <PROJECT_ID>
#   CLOUDSDK_ACTIVE_CONFIG_NAME=personal scripts/deploy.sh <PROJECT_ID> secret <NAME>   # value from stdin
#
# Runbook: docs/deploy/README.md
set -euo pipefail

REGION=asia-northeast3
SERVICE=yggdrasil
REPO=yggdrasil
RUN_SA=yggdrasil-run
REQUIRED_SECRETS=(DATABASE_URL SUPABASE_URL SUPABASE_ANON_KEY YGGDRASIL_ALLOWED_EMAILS)
OPTIONAL_SECRETS=(OPENAI_API_KEY GITHUB_WEBHOOK_SECRET TELEGRAM_BOT_TOKEN TELEGRAM_CHAT_ID BRIEFING_OWNER_ID BRIEFING_SECRET)

die() { echo "deploy: $*" >&2; exit 1; }

PROJECT_ID="${1:-}"
[[ -n "$PROJECT_ID" ]] || die "usage: $0 <PROJECT_ID> [secret <NAME>]"

# Safety guard: the machine's default gcloud config is a company account.
account="$(gcloud config get-value account 2>/dev/null || true)"
active_project="$(gcloud config get-value project 2>/dev/null || true)"
[[ -n "$account" ]] || die "no active gcloud account (activate the 'personal' configuration)"
[[ "$account" != *@creatived.kr ]] || die "refusing: active account $account is a company account"
[[ "$PROJECT_ID" != sokind-ai && "$active_project" != sokind-ai ]] || die "refusing: sokind-ai is a company project"
echo "deploy: account=$account project=$PROJECT_ID"

g() { gcloud --project "$PROJECT_ID" --quiet "$@"; }
sa_email="$RUN_SA@$PROJECT_ID.iam.gserviceaccount.com"

if [[ "${2:-}" == secret ]]; then
  name="${3:-}"
  [[ -n "$name" ]] || die "usage: $0 <PROJECT_ID> secret <NAME>"
  if [[ -t 0 ]]; then read -rsp "$name: " value; echo >&2; else IFS= read -r value || true; fi
  [[ -n "$value" ]] || die "empty value for $name"
  g secrets describe "$name" >/dev/null 2>&1 || g secrets create "$name" --replication-policy=automatic
  # printf is a builtin: the value never shows up in ps or the terminal.
  printf %s "$value" | g secrets versions add "$name" --data-file=-
  echo "deploy: $name updated (redeploy to pick up :latest)"
  exit 0
fi

g services enable run.googleapis.com artifactregistry.googleapis.com secretmanager.googleapis.com iam.googleapis.com

if ! g artifacts repositories describe "$REPO" --location "$REGION" >/dev/null 2>&1; then
  g artifacts repositories create "$REPO" --location "$REGION" --repository-format docker
fi
policy="$(mktemp)"
trap 'rm -f "$policy"' EXIT
cat >"$policy" <<'JSON'
[
  {"name": "keep-latest-2", "action": {"type": "Keep"}, "mostRecentVersions": {"keepCount": 2}},
  {"name": "delete-rest", "action": {"type": "Delete"}, "condition": {"tagState": "any"}}
]
JSON
g artifacts repositories set-cleanup-policies "$REPO" --location "$REGION" --policy "$policy" --no-dry-run

g iam service-accounts describe "$sa_email" >/dev/null 2>&1 \
  || g iam service-accounts create "$RUN_SA" --display-name "Yggdrasil Cloud Run"

secret_flags=()
for name in "${REQUIRED_SECRETS[@]}" "${OPTIONAL_SECRETS[@]}"; do
  if ! g secrets describe "$name" >/dev/null 2>&1; then
    [[ " ${OPTIONAL_SECRETS[*]} " == *" $name "* ]] && continue
    die "missing secret $name — run: $0 $PROJECT_ID secret $name"
  fi
  g secrets add-iam-policy-binding "$name" --member "serviceAccount:$sa_email" \
    --role roles/secretmanager.secretAccessor >/dev/null
  secret_flags+=("$name=$name:latest")
done

cd "$(dirname "$0")/.."
tag="$(git rev-parse --short HEAD)"
[[ -z "$(git status --porcelain)" ]] || tag="$tag-dirty-$(date +%Y%m%d%H%M%S)"
image="$REGION-docker.pkg.dev/$PROJECT_ID/$REPO/$SERVICE:$tag"

# ponytail: short-lived docker login instead of `gcloud auth configure-docker`, so no global cred helper is installed.
g auth print-access-token | docker login -u oauth2accesstoken --password-stdin "https://$REGION-docker.pkg.dev"
docker buildx build --platform linux/amd64 -t "$image" --push .

g run deploy "$SERVICE" \
  --image "$image" \
  --region "$REGION" \
  --service-account "$sa_email" \
  --max-instances 1 \
  --min-instances 0 \
  --allow-unauthenticated \
  --set-env-vars NODE_ENV=production \
  --set-secrets "$(IFS=,; echo "${secret_flags[*]}")"

url="$(g run services describe "$SERVICE" --region "$REGION" --format 'value(status.url)')"
echo "deploy: $url"

cat <<EOF

Budget alert (5,000 KRW, run once; amount currency must match the billing account):
  gcloud --project $PROJECT_ID services enable billingbudgets.googleapis.com
  gcloud billing accounts list
  gcloud billing budgets create --billing-account=<BILLING_ACCOUNT_ID> \\
    --display-name=yggdrasil-5000krw --budget-amount=5000KRW \\
    --filter-projects=projects/$PROJECT_ID \\
    --threshold-rule=percent=0.5 --threshold-rule=percent=0.9 --threshold-rule=percent=1.0
EOF

curl -fsS "$url/api/health" && echo
