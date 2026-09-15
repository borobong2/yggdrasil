# AI-native 개발 워크스페이스 설계

## 목적

Yggdrasil은 한 사람이 요구를 캡처하고, AI가 설계 문서와 FE/BE/문서화 작업안을 제안하며, 사람이 수락한 결과만 실행 작업으로 남기는 개발 워크스페이스다.

## 완료 기준

Nexus의 개인 사용자에게 유효한 영역인 계층, 실행 보드, 문서, 검색, MCP, PR/deployment URL evidence, 활동 감사를 제공한다. 팀·초대·presence·알림·모니터링·회고·SSE·GitHub OAuth/webhook은 단일 owner 제품의 범위 밖이다. Yggdrasil은 Nexus에 없는 불변 캡처, 명시 승인, proposal provenance를 추가로 제공한다.

## 소유권과 보존

- 모든 영속 행은 `owner_id`로 격리한다. route와 service 모두 owner를 검증한다.
- 캡처는 삭제·변환·수락으로 바뀌지 않는다. 모든 계획과 수락 기록은 원본 capture를 참조한다.
- 문서, Goal, Epic, Issue, evidence는 owner가 읽고 수정한다. AI/MCP는 승인된 작업을 직접 바꾸지 않는다.

## 작업 모델

개인용 최소 hierarchy는 `Goal → Epic → Issue`다. Issue는 `backlog|todo|doing|done`, position, priority, due date를 가진다. 문서는 tree와 typed document-to-issue link를 사용한다. 범용 polymorphic link와 Project/Feature 단계는 도입하지 않는다.

## AI와 승인 경계

AI provider는 capture를 데이터로 취급하고, `design { title, body }`와 `lanes { fe[], be[], docs[] }`의 평탄한 proposal만 반환한다. 레인별 항목 수는 서버 상한을 둔다. provider 출력은 strict schema로 검증하고 pending proposal만 저장한다.

`POST /api/delivery-plan-proposals/:id/accept`만 plan mutation을 수행한다. transaction은 pending proposal을 lock하고, 문서·Goal/Epic/Issue·typed links·provenance·activity를 모두 만들거나 전부 rollback한다. 재수락은 conflict, dismiss는 proposal/activity만 남긴다.

## MCP와 evidence

MCP는 PAT hash로 단일 owner를 확인하며 `search_workspace`, `read_document`, `read_planning_tree`, `create_capture`, `request_delivery_plan`만 제공한다. accept/update/delete tool은 없다. PAT는 발급 시 한 번만 표시하고 hash, last-used, revoked-at만 저장한다.

Issue evidence는 검증된 HTTPS GitHub PR/commit 또는 deployment URL만 저장한다. URL evidence는 issue 상태를 바꾸지 않는다.

## 티켓 완료 형식

각 티켓은 공통 계약/DB, BE, FE, 통합 검증을 모두 포함한다. BE와 FE는 contract 확정 후 병렬 가능하다. API owner-one/owner-two test, DB rollback/snapshot test, browser happy path, 정확한 명령과 결과를 `STATE.md`에 기록해야 완료다.

## 승인 지점

1. 이 설계와 YG-00 계약 승인
2. AI proposal preview 뒤 owner 수락
3. PAT 발급/폐기
4. production credential, 배포, 외부 evidence URL 사용
