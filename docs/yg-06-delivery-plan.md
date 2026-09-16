# YG-06 검토 가능한 AI delivery-plan 작업지시서

## 목표

capture 텍스트로부터 설계 문서와 FE/BE/Docs lane의 평탄한 계획을 pending proposal로만 생성하고 read-only preview를 제공한다.

## 공통/BE/FE

- 공통/DB: `delivery_plan_proposals`는 capture, owner, model, strict JSON, pending 상태만 저장한다. 레인 항목 수는 서버 상한을 둔다.
- BE: strict structured output validation과 `POST/GET /api/captures/:id/delivery-plan`; provider 오류·malformed output은 fail-closed다.
- FE: capture에서 generation trigger와 design/lane preview만 제공한다. accept/dismiss/영속 work 생성은 YG-07 범위다.

## 검증

red test 후 valid proposal은 proposal row 하나만 만들고 capture/document/Goal/Epic/Issue를 바꾸지 않음을 SQL snapshot으로 검증한다. invalid/provider error, owner isolation, reload list, built client secret exclusion을 확인한다.

## 비범위/trust

AI가 ID/대상 hierarchy를 정하거나 작업을 생성하지 않는다. 수락 transaction, MCP request tool은 후속 티켓이다.
