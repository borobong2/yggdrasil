# YG-04 backlog와 실행 보드 작업지시서

## 목표

단일 owner가 Issue를 backlog와 `todo|doing|done` 보드 사이에서 안정적인 순서로 이동하고, 이동 사실을 활동 기록으로 확인한다.

## 공통/BE/FE

- 공통/DB: 기존 `IssueStatus`, `issues.position`, 활동 계약을 사용한다. 새 hierarchy 모델은 변경하지 않는다.
- BE: `PATCH /api/issues/:id/move { status, position }`가 owner 검증, sibling 재정렬, activity 한 건 기록을 하나의 transaction으로 처리한다.
- FE: `BoardView`에서 backlog와 3열을 표시하고 명시적 move control을 제공한다. loading/empty/error를 표시한다.

## 검증

red test 후 owner-one/owner-two, 같은 열 재정렬, backlog↔board 이동, 정확히 한 activity를 API/SQL로 검증한다. 전용 DB에서 migrate, `npm test`, typecheck, build, browser move/reload를 실행한다.

## 비범위/trust

drag-and-drop, sprint, SSE, AI/MCP work mutation은 제외한다. capture와 proposal은 변경하지 않는다.
