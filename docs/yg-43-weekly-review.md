# YG-43 실제 시간 기록 · 주간 회고

## 목표

- 완료한 일에 실제로 걸린 시간을 적고, 예상 시간과 비교한다.
- 「회고」 탭에서 한 주(월–일, Asia/Seoul)를 돌아본다: 완료, 예상 vs 실제, 못 끝낸 것, 방치, 활동 요약, 회고 메모 문서.

## 계약 (migration 0019)

- `issues.actual_minutes` (nullable integer, CHECK 1–100000). 새 테이블 없음 → RLS 그대로. 반복 다음 회차는 복사하지 않는다(회차마다 다름).
- `Issue.actualMinutes`, `todoFields.actualMinutes` (zod: 양의 정수, ≤ 100000, null로 지움). `WeekReview`·주 계산 함수는 `src/contracts/review.ts`.
- 주: 월요일 날짜로 이름 짓는다. ISO 주 라벨(`2026-W42`)은 목요일이 속한 해 기준.
- 완료 = 보관 안 된 done 중 `completed_at`이 [월 00:00, 다음 월 00:00) KST.
- 예상 vs 실제 = 완료 중 예상·실제가 모두 있는 것만. ratio = 실제 합 / 예상 합 (소수 둘째 자리).
- 못 끝낸 것 = 마감일(KST 날짜)이 이 주에서 이미 시작한 날이고, 주가 끝날 때까지 done이 아님(아직 열림 또는 다음 주 이후 완료).
- 새로 기한 지남 = 지금 열려 있고, 기한 지남이 된 순간(종일: 다음 날 00:00, 시각: 그 시각)이 이 주 안이며 지금 이전.
- 방치 = YG-41 `staleView` 개수, 항상 현재 기준.
- 활동 = 이 주 issue 활동의 생성·완료·이동 수와 경로(`payload.via`; 없으면 ui — 보드 이동 등) 집계.
- 회고 메모 = 제목이 정확히 `주간 회고 YYYY-Www`인 살아 있는 문서. 없으면 FE가 기존 `POST /api/documents`로 만든다.

## BE

- `completeTodo(owner, id, via, completedAt?, actualMinutes?)`: 이미 done이면 둘 다 없을 때만 아무 일도 안 함.
- `PATCH /api/todos/:id` `{ actualMinutes }`, `POST /api/todos/:id/complete` `{ completedAt?, actualMinutes? }`.
- MCP: `complete_todo`·`update_todo`·`create_todo`가 `actualMinutes`를 받는다(via=mcp). 리소스 `todo://review/week`(이번 주 markdown, `src/server/mcp-review.ts`).
- `weekReview(owner, date?, now?)` (`src/server/review.ts`) → `GET /api/review/week?start=YYYY-MM-DD` (그 날이 속한 주, 기본 이번 주, 잘못된 날짜 400, owner-scoped).

## FE

- 탭 「회고」(활동 다음), `#/review/<월요일>`로 주 이동(이전·다음·이번 주).
- 요약 타일 4개, 영역별 배지, 완료 목록(완료일·예상·실제), 예상/실제 막대(inline SVG, 차이는 텍스트로), 못 끝낸 것 + 새로 기한 지남, 방치 → `#/today/stale`(밀린 일 + 정리 모드), 활동 요약.
- 항목을 누르면 TodoDetail. 상세의 「실제 시간 (분)」은 done이거나 값이 있을 때 보인다.

## 검증

- `npx vitest run --dir test` (`test/yg43-weekly-review.test.ts` + 기존), `npm run typecheck`, `npm run build`, `git diff --check`
- 브라우저: `npm run build && NODE_ENV=test DATABASE_URL=…/yggdrasil_yg43 npx tsx test/yg43-browser-server.ts` 후 `node test/yg43-browser.mjs <dir>`

## 한계

- 방치 수는 과거 주를 봐도 현재 기준이다(이력 없음).
- 활동은 이 주에 기록된 이벤트 기준이라, 완료일을 과거로 바꾼 완료는 완료 목록과 활동 수가 다를 수 있다.
- 앱 전체가 라이트 테마뿐이라 회고 화면도 토큰만 쓴다(다크 토큰이 생기면 따라감).
