# YG-23 문서 탭 노션형 (페이지 트리 + 블록 에디터)

Issue #45. 문서 탭을 페이지 트리 + 블록 에디터로 바꾼다. 범위 밖: 실시간 협업, 표(DB) 뷰, 댓글, 이미지 업로드.

## 공통 계약

- Migration `0012_document_tree.sql`: `documents.position integer not null default 0`(기존 행은 생성순으로 backfill), `archived_at timestamptz`, `icon text` (1–16자). 새 테이블 없음 → 0011 RLS 그대로 적용, `test/rls.test.ts` 통과.
- `Document` 타입에 `position`, `archivedAt`, `icon` 추가. `body`는 계속 마크다운 문자열 (MCP `read_document` 그대로).

## BE (owner-scoped)

| Route | 동작 |
| --- | --- |
| `GET /api/documents` | 휴지통 제외, `position` 순. `?archived=true`는 휴지통만 |
| `POST /api/documents` | `icon` 선택, 형제 끝에 추가. 보관된 부모 아래 생성 불가 |
| `PATCH /api/documents/:id` | `icon` (null로 제거) 추가 |
| `POST /api/documents/:id/move` `{ parentId, index }` | 한 transaction에서 형제 순서를 다시 매김. 자기 자신/후손 아래로 이동(순환) 400, 남의 부모 404, 보관된 문서·부모 400 |
| `POST /api/documents/:id/archive` | 문서와 살아 있는 후손을 같은 `archived_at`으로 보관 |
| `POST /api/documents/:id/restore` | 같은 배치만 복원. 부모가 아직 휴지통이면 최상위로 복원 |

검색은 휴지통 문서를 제외한다.

## FE

- `DocumentsWorkspace.tsx`: 페이지 트리(펼치기/접기는 localStorage, 하위 페이지 추가, 드래그로 앞/뒤/안쪽 이동, 후손 위 드롭 무시), 최근 페이지(수정순 4개, 페이지 4개 이상일 때), 휴지통/복원, 이모지 아이콘(native `popover`), 경로, 저장 상태, 하단 하위 페이지·연결된 할 일. `#document-<id>` 해시로 열린 페이지 유지 → ⌘K 결과가 해당 페이지를 바로 연다. 모바일(<768px)은 목록 ↔ 에디터 전환.
- `BlockEditor.tsx` + `blocks.ts`: 블록마다 자동 높이 `<textarea>`. 포커스 밖 블록은 인라인 마크다운(굵게, 기울임, 취소선, 코드, 링크, @멘션 칩)을 렌더한다. `/` 메뉴, 마크다운 단축키(`# ## ### - * 1. [] > ``` ---`), 드래그 핸들(클릭 시 위/아래/삭제 메뉴, Alt+Shift+↑↓), 여러 줄 붙여넣기는 text/plain만 읽어 블록으로 변환, 700ms 디바운스 자동 저장, `@`/`/할 일 언급` → `document_issue_links` 연결.

### 에디터 선택 근거

BlockNote(MPL-2.0, Mantine 포함 수백 KB)나 Tiptap(MIT, ProseMirror + 마크다운 확장 4–6개 패키지)을 넣지 않았다. 블록 목록은 마크다운과 1:1로 대응하므로 직접 구현하면 왕복 손실이 거의 없고, textarea라 한글 IME와 깨끗한 붙여넣기가 기본으로 동작한다. 새 의존성 0, 번들 +9.6 kB gzip (78.5 → 88.1 kB).

### 마크다운 대응과 한계

| 블록 | 마크다운 |
| --- | --- |
| 제목 1–3 | `#`, `##`, `###` |
| 글머리 / 번호 / 체크 | `- `, `1. `, `- [ ] ` / `- [x] ` |
| 인용 | `> ` |
| 콜아웃 | GitHub alert `> [!NOTE]` |
| 토글 | `<details><summary>제목</summary>…</details>` (첫 줄 = 제목, 나머지 = 본문 텍스트) |
| 코드 | ```` ```lang ```` |
| 구분선 | `---` |
| 표 (YG-48) | GFM 파이프 표 (`\| a \| b \|` + `\|---\|:-:\|`). 블록 텍스트 = 표 마크다운 원문, 클릭하면 모노스페이스 textarea + 실시간 미리보기 |
| 할 일 언급 | `[@제목](#issue-<uuid>)` |

알려진 정규화(데이터 손실 아님): 연속 빈 줄 1개로 합침, 번호 목록은 1부터 다시 매김, 느슨한 목록은 촘촘하게, setext 제목(`제목\n---`)은 문단 + 구분선, 중첩 목록은 부모 항목 안의 원문 텍스트로 유지(들여쓰기 블록 아님), 토글 본문은 중첩 블록이 아닌 텍스트, 다른 alert 종류(`[!TIP]` 등)는 `[!NOTE]`로 저장. 실행 취소는 블록 안에서만 동작한다. 표는 각 줄의 앞뒤 공백만 정리한다. 표 셀 안의 `|`는 GFM처럼 코드 안에서도 `\|`로 이스케이프해야 하고, 셀 안 줄바꿈·셀 단위 편집 UI는 없다(원문 편집).

## 검증

- `npm test` (API: 이동·순환 방지·owner isolation·휴지통/복원·아이콘·마크다운 보존, `test/document-markdown.test.ts` 왕복), `npm run typecheck`, `npm run build`, `git diff --check`.
- 브라우저: `npm run build` 후 `NODE_ENV=test DATABASE_URL=…/yggdrasil_yg23 npx tsx test/yg23-browser-server.ts`, 그리고 `PLAYWRIGHT=<설치된 playwright 경로> PLAYWRIGHT_CHANNEL=chrome node test/yg23-browser.mjs`. 슬래시 메뉴, 새로고침 후 유지, 하위 페이지, 드래그 재배치, 휴지통, 390px 모바일을 확인하고 스크린샷을 남긴다.
