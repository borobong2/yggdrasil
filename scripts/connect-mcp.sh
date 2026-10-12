#!/usr/bin/env bash
# Connect Claude Code and Codex to the Yggdrasil MCP server in one go.
#
#   scripts/connect-mcp.sh [MCP_URL]
#
# Asks for one PAT per client (issue them in the app: 설정 → PAT), stores them in the macOS Keychain,
# registers the `yggdrasil` MCP server for both clients, then checks each token against the server.
# Tokens are read silently and never printed.
set -euo pipefail

URL="${1:-https://yggdrasil-539022479969.asia-northeast3.run.app/mcp}"
CLAUDE_ITEM=yggdrasil-claude-pat
CODEX_ITEM=yggdrasil-codex-pat
ENV_VAR=YGGDRASIL_PAT
ZSHRC="$HOME/.zshrc"

read -rsp "Claude Code PAT: " claude_pat; echo
read -rsp "Codex PAT (Enter = Claude와 같은 토큰): " codex_pat; echo
codex_pat="${codex_pat:-$claude_pat}"
[[ -n "$claude_pat" ]] || { echo "PAT가 비어 있어요" >&2; exit 1; }

# -U updates an existing item, so rerunning the script rotates tokens.
security add-generic-password -U -a "$USER" -s "$CLAUDE_ITEM" -w "$claude_pat"
security add-generic-password -U -a "$USER" -s "$CODEX_ITEM" -w "$codex_pat"
echo "✓ 키체인 저장: $CLAUDE_ITEM, $CODEX_ITEM"

# Claude Code: user scope, token in the Authorization header (~/.claude.json).
if command -v claude >/dev/null; then
  claude mcp remove yggdrasil -s user >/dev/null 2>&1 || true
  claude mcp add --scope user --transport http yggdrasil "$URL" \
    --header "Authorization: Bearer $claude_pat" >/dev/null
  echo "✓ Claude Code 등록: $URL"
else
  echo "- claude 명령이 없어 건너뜀"
fi

# Codex: token comes from an env var that every new shell loads from the Keychain.
if command -v codex >/dev/null; then
  line="export $ENV_VAR=\"\$(security find-generic-password -s $CODEX_ITEM -w 2>/dev/null)\""
  grep -qxF "$line" "$ZSHRC" 2>/dev/null || printf '\n# Yggdrasil MCP (Codex)\n%s\n' "$line" >> "$ZSHRC"
  codex mcp remove yggdrasil >/dev/null 2>&1 || true
  codex mcp add yggdrasil --url "$URL" --bearer-token-env-var "$ENV_VAR" >/dev/null
  echo "✓ Codex 등록: $URL (토큰은 \$$ENV_VAR ← 키체인, ~/.zshrc)"
else
  echo "- codex 명령이 없어 건너뜀"
fi

# Verify each token with a real MCP call (stateless server: tools/list needs no session).
check() {
  local name=$1 token=$2 code
  code=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$URL" \
    -H "Authorization: Bearer $token" -H 'Content-Type: application/json' \
    -H 'Accept: application/json, text/event-stream' \
    -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}')
  if [[ "$code" == 200 ]]; then echo "✓ $name 토큰 확인 (HTTP 200)"; else echo "✗ $name 토큰 실패 (HTTP $code)"; fi
}
check "Claude Code" "$claude_pat"
[[ "$codex_pat" == "$claude_pat" ]] || check "Codex" "$codex_pat"

echo
echo "다음: Claude Code와 Codex를 새로 시작하세요 (tmux pane 포함). Codex는 새 터미널에서 \$$ENV_VAR를 읽어요."
