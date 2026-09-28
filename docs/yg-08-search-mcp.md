# YG-08 — 통합 검색과 PAT MCP 구현 계획

승인: 2026-09-21 사용자 작업시작 지시. 기준 `192eecc`, GitHub #9 및 최신 PRODUCT/구현계획 우선. 이 문서는 승인된 범위를 구체화한다.

## 목표 / 경계
UI Cmd+K와 MCP가 같은 owner 검색 서비스를 사용한다. MCP는 검색/읽기/캡처/계획 제안만 허용한다. 스키마, activity writer, evidence, board, plan acceptance는 변경하지 않는다. main 병합/배포하지 않는다.

## 계약과 파일 소유권
- `src/contracts/search.ts`: `SearchResult { kind: 'document'|'goal'|'epic'|'issue'|'capture'; id: string; title: string; preview: string }`. 응답은 배열, 전체 최대 50건, kind/id 정렬. q trim, 빈 값은 [], 200자 초과는 400. SQL parameter binding + literal ILIKE escaping (`%`, `_`, `\\`). 문서 title/body, work title, capture text 검색. title/preview 최대 200자.
- orchestrator: `src/server/search.ts`, `routes/search.ts`, `mcp.ts`, `routes/mcp.ts`, `pats.ts`, `app.ts`, `package*.json`, `test/search.test.ts`, `test/mcp.test.ts`, docs.
- pane 3: `src/client/SearchCommand.tsx`만 구현, props는 `{ token: string }`. main.tsx 등록은 orchestrator. native dialog, Cmd/Ctrl+K, Escape, focus 복귀, 검색 form, loading/empty/error/401, 결과 kind/title/preview, token 변경시 이전 결과 제거와 요청 취소. read-only 결과 표시로 domain mutation 없음.
- pane 2: 독립 read-only review. 수정 금지, findings를 pane 1에 보고.
- 공통 `app.ts`/`main.tsx`는 import/등록만, STATE는 YG-08 섹션만 append. items.ts 변경 불필요.

## BE / trust rule
- `/api/search`는 ownerAuth, searchWorkspace(ownerId,q) 재사용.
- `/mcp`는 매 요청 PAT SHA-256 hash + revoked_at IS NULL로 owner resolve, last_used_at 갱신. PAT 만료는 없고 revoked_at이 무효화 기준이다. Supabase bearer/dev override는 MCP에 허용하지 않음. invalid/revoked/missing 401. Origin이 있으면 유효한 HTTP(S) origin이고 request host(port 포함)와 같아야 함. TLS 종료 프록시 때문에 scheme은 비교하지 않음.
- SDK의 stateless Web Standard Streamable HTTP transport와 JSON response 사용. 프로토콜 negotiation/validation/client compatibility를 직접 재구현하지 않도록 `@modelcontextprotocol/sdk` 및 schema peer `zod`만 추가. 참고: https://ts.sdk.modelcontextprotocol.io/server
- 도구 정확히 `search_workspace({q})`, `read_document({id})`, `read_planning_tree({})`, `create_capture({text})`, `request_delivery_plan({captureId})`. strict input, UUID 검증, blank text 거부, bounded text.
- getDocument/planningTree/createCapture 재사용. request_delivery_plan은 findDeliveryPlanCapture로 owner 확인 후 기존 generateDeliveryPlan(ownerId,capture,provider) 호출. signature 변경/로직 복제 없음. `createApp`의 deliveryPlanProvider를 `registerMcpRoutes(app, deliveryPlanProvider)`로 전달한다. provider malformed/failure는 안전한 tool error, 영속 작업/원본 변경 없음.
- transport/request마다 server instance로 owner 상태 공유 방지. accept/update/delete 도구는 정의도 실행도 없음.

## 실행 / 검증
- [x] npm ci; 전용 DB 생성/마이그레이션; baseline test/typecheck/build.
- [x] 검색 HTTP red test: owner 2 숨김, 다섯 종류/본문, case insensitive, wildcard literal, blank/long, cap.
- [x] MCP red test: 실제 SDK Client + StreamableHTTPClientTransport initialize/list/call; 정확한 allowlist, forbidden call, owner 격리, invalid/revoked/48시간 전 발급 PAT도 revoke 전 유효, 모든 허용 tool, provider 실패/잘못된 입력과 snapshot 보존.
- [x] 최소 구현과 테스트 green; UI 독립 구현 통합.
- [x] 최종 `DATABASE_URL=postgres://yggdrasil:yggdrasil@127.0.0.1:54330/yggdrasil_yg08 npm test`, `npm run typecheck`, `npm run build`.
- [x] `PORT=3008 DATABASE_URL=postgres://yggdrasil:yggdrasil@127.0.0.1:54330/yggdrasil_yg08 YGGDRASIL_DEV_OWNER_ID=00000000-0000-4000-8000-000000008001 npm start`; browser Cmd+K/검색/empty/error/Escape/focus/owner 상태 검증.
- [x] STATE에 정확한 결과와 baseline 대비 기록. 실 Supabase/OpenAI/배포는 외부 자격증명 없으면 미검증 명시.
- 독립 리뷰 후 commit/push/Draft PR로 전달한다. main merge/deploy 금지. 완료 URL/commit은 최종 보고에 기록한다.

## 통합 주의
YG-10과 다른 브랜치를 병합하지 않는다. delivery-plans.ts 공유 경로를 호출하므로 YG-10 activity 추가가 자동 적용된다. 모든 테스트/서버에 전용 DATABASE_URL을 명시한다. 테스트는 직렬로 실행하고 pane worker는 DB를 사용하지 않는다.

## MVP 한계
ILIKE 부분문자 검색은 순차 스캔이며 전역 50건 cap은 kind/id 순서다. 대규모 데이터의 ranking/종류별 quota/index 및 provider 비용 rate limit은 이번 범위에서 추가하지 않는다. HTTP Origin은 Hono에서 `new URL(request.url).host`와 직접 비교한다(port 포함, TLS 종료 지원). DB 포트는 현재 실행 중인 postgres 컨테이너의 54330이고 database 이름으로 격리한다.

## MCP client 사용
UI의 PAT settings에서 토큰을 발급하고 최초 1회 표시된 값을 client의 secret 환경변수에 저장한다. PAT는 owner UI API 로그인 토큰으로 사용하지 않는다. 클라이언트에는 Streamable HTTP URL `http://127.0.0.1:3008/mcp`와 `Authorization: Bearer <PAT>`를 설정한다. 만료/refresh/세션 저장소는 없으며 매 요청마다 폐기 여부를 검사한다. HTTPS 배포 URL에서는 같은 경로를 사용한다.

```ts
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
const client = new Client({ name: 'workspace-client', version: '1.0.0' });
await client.connect(new StreamableHTTPClientTransport(new URL('http://127.0.0.1:3008/mcp'), {
  requestInit: { headers: { Authorization: `Bearer ${process.env.YGGDRASIL_PAT}` } }
}));
console.log(await client.listTools());
console.log(await client.callTool({ name: 'search_workspace', arguments: { q: 'design' } }));
await client.close();
```

GET/DELETE는 stateless endpoint에서 405, POST notification은 SDK가 202로 처리한다. 응답은 JSON이며 지속 SSE 채널은 사용하지 않는다. `enableJsonResponse`에서는 SDK가 완성된 JSON Response를 resolve한 뒤 finally에서 server/transport를 close한다. 도구 실패는 `isError: true`, 인증 실패는 HTTP 401이다. request_delivery_plan은 OpenAI 설정이 없으면 안전한 configuration error를 반환한다.

리뷰 메모: SDK는 empty-object default schema에서 additionalProperties:false를 광고하지 않지만 런타임 strict 검증은 유지한다. YG-10 통합 시 MCP 성공 snapshot의 activities는 proposal-created 1행을 별도 단정하도록 변경해야 한다. 기존 planning 테스트의 공용 owner 2 빈 트리 전제를 보존하기 위해 YG-08 fixture owner는 8001/8002를 사용한다.
