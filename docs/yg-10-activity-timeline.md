# YG-10 — Owner activity timeline

## 승인과 목표

사용자의 2026-09-21 작업시작 지시가 이 범위의 구현 승인이다. 기준은 main `192eecc`, GitHub #11, 최신 PRODUCT/구현계획이며 초기 ticket-plan보다 우선한다. 기존 owner가 핵심 mutation의 기록을 최신순으로 확인한다.

## 범위와 계약

- 기존 `activities` 테이블/인덱스/Activity 타입을 재사용한다. migration과 새 dependency는 필요 없다.
- kind: `issue.moved`, `delivery-plan.created`, `delivery-plan.accepted`, `delivery-plan.dismissed`, `evidence.added`. 기존 subject type을 유지하며 evidence는 `issue` subject에 evidenceId/url/kind payload를 남긴다.
- 각 성공 mutation은 자신의 DB transaction에서 activity 하나를 append한다. board/accept/dismiss의 기존 기록은 공통 writer 호출로 교체하며 중복 추가하지 않는다. writer에는 transaction을 필수 전달하고 update/delete API는 만들지 않는다.
- `GET /api/activities` → `Activity[]`, 인증 owner만 조회, `createdAt DESC, id DESC`, 최신 100건 고정 상한. query로 owner/상한을 변경할 수 없다. 401은 기존 ownerAuth를 사용한다.
- 생성 service는 capture owner를 재검증하고 persisted capture를 사용한다. `generateDeliveryPlan`, `findDeliveryPlanCapture`, capture service의 export/signature는 유지한다. YG-08 MCP도 동일 service를 호출해야 하며 route에서 기록하지 않는다.
- evidence/proposal 생성은 business row와 activity를 한 transaction으로 기록한다. provider 실패/검증 실패/DB 실패/권한 실패에는 새 activity가 0이다.
- activity는 source capture/issue/evidence 삭제와 무관하게 보존된다. capture는 변경하지 않는다. AI 제안 생성은 작업 생성/수락 권한을 부여하지 않는다.

## 파일과 소유권

- Orch BE/통합: `src/server/activity.ts`, `src/server/routes/activity.ts`, `src/server/{board,delivery-plans,plan-acceptance,evidence}.ts`, `test/activity.test.ts`, `test/activity-browser-server.ts`, `src/server/routes/delivery-plans.ts`의 service NotFound→404 매핑, 관련 기존 테스트의 새 activity 기대값.
- Orch 공통 파일: `src/contracts/items.ts` Activity kind 확장, `src/server/app.ts` route 등록, `src/client/main.tsx` timeline/callback 연결만, `docs/loop/STATE.md` YG-10 섹션만.
- Pane 3 FE: `src/client/ActivityTimeline.tsx`, `src/client/{BoardView,CaptureDeliveryPlan,EvidenceList}.tsx`만. mutation 성공 후 optional `onActivity?: () => void` callback을 즉시 호출한다. Timeline props `{token: string; revision: number}`, token/revision 변화 및 Refresh 버튼으로 refetch한다. loading/empty/error/401 상태, stale request 취소, owner 전환 시 이전 데이터 숨김을 제공한다.
- Pane 2: 읽기 전용 독립 리뷰. 코드/DB/STATE 수정 금지. pane map 실제 확인: orch `%42`, Claude `%43`, Codex `%44`.
- SSE/presence/notifications, auth/PAT/MCP/search, package dependencies, 다른 worktree/DB 변경, 다른 티켓 merge, main merge/deploy 제외.

## 실행과 검증

1. `npm ci`; 전용 `yggdrasil_yg10` DB 준비, migration, baseline test/typecheck/build. 모든 DB 명령에 아래 DATABASE_URL을 명시한다. 공유 `yggdrasil`은 접속/테스트/마이그레이션하지 않는다.
2. API/DB red tests → writer와 service transaction/API 구현 → green. 지원 다섯 mutation의 정확히 한 건, 직접 service 호출, owner two/무인증, 정렬/100건 상한, 불변 capture, evidence 삭제 후 기록 보존, trigger로 강제 실패 rollback을 검증한다.
3. 고정 계약에 따라 FE 병렬 구현 및 orch 공통 파일 연결. 브라우저는 port 3010, test-only provider/local owner를 사용해 성공 후 refetch와 loading/empty/error/owner 전환을 확인한다.
4. 독립 리뷰 후 `npm test`, `npm run typecheck`, `npm run build`, `git diff --check`; 증거/실패와 외부 자격증명 제한을 STATE에 기록한다.
5. 검증된 변경을 `feat: add owner activity timeline` 커밋, `feat/yg-10` push 및 main 대상 Draft PR. 자동 merge/deploy 없음.

```sh
export DATABASE_URL=postgres://yggdrasil:yggdrasil@127.0.0.1:54331/yggdrasil_yg10
npm run db:migrate
npm test -- test/activity.test.ts
npm test
npm run typecheck
npm run build
git diff --check
```

기존 YG-06 보존 snapshot은 성공 생성 시 `activities`만 추가 허용하며 실패 snapshot은 계속 모든 테이블을 검사한다. YG-07 subject 전체 기록 기대는 created와 accepted/dismissed를 각각 검증하도록 갱신한다.
