# YG-22 — 보드 드래그앤드롭 + 사용성 개선

## 승인과 목표

GitHub #44가 구현 승인이다. 보드에서 카드를 끌어 상태·순서를 바꾸고, 카드에서 바로 상세를 확인·수정한다.

## 범위와 계약

- BE: 기존 `PATCH /api/issues/:id/move` 재사용. owner-scoped `PATCH /api/todos/:id`(제목·우선순위·보류+사유·마감일·예정일·메모·예상시간, area/epic/status도 MCP와 같은 스키마)와 `POST /api/todos/:id/complete` 추가. 검증은 MCP 도구와 같은 zod 스키마(`todoFields`, `todos.ts`로 이동)를 공유하고, 활동은 `payload.via = 'ui'`. 완료로 바뀐 할 일은 완료 열 맨 위에 놓인다(최근 완료가 위).
- FE: 열 순서 할 일·진행 중·완료·백로그. 마우스·터치(250ms 길게 누르기)·키보드(Space 들기, 방향키, Space/Enter 놓기, Esc 취소) 드래그, 한국어 스크린리더 안내. 낙관적 반영 후 실패 시 원위치 복구 + 오류 안내. 카드 `…` 메뉴의 상태 이동이 보조 수단. 카드 클릭/Enter → 상세 패널(모바일 시트). 필터: 영역·우선순위·보류. 완료 열은 최근 5개 + 더보기. 좁은 화면은 보드 안에서 열이 가로 스크롤(페이지 가로 넘침 없음).
- 의존성: `@dnd-kit/core`·`@dnd-kit/sortable`·`@dnd-kit/utilities` — 네이티브 HTML5 DnD는 터치와 키보드를 지원하지 않는다. 개발 전용 `playwright-core`(브라우저 다운로드 없음)로 브라우저 검증.
- migration 없음. 비범위: 다중 선택 이동, 열 간 자동 정렬 규칙, 실시간 동기화.

## 파일

`src/server/todos.ts`, `src/server/mcp.ts`, `src/server/routes/todos.ts`, `src/server/app.ts`, `src/client/BoardView.tsx`, `src/client/TodoDetail.tsx`, `test/todo-routes.test.ts`, `test/board-browser-server.ts`, `test/yg22-board-browser.mjs`.

## 검증

```sh
export DATABASE_URL=postgres://yggdrasil:yggdrasil@127.0.0.1:54330/yggdrasil_yg22
npm run db:migrate && npm test && npm run typecheck && npm run build && git diff --check
NODE_ENV=test npx tsx test/board-browser-server.ts &   # 새 dev owner로 빈 보드
node test/yg22-board-browser.mjs tmp/yg22-screens      # CHROME_PATH로 Chromium 지정 가능
```
