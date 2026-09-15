# YG-02 문서 워크스페이스 작업지시서

목표: 단일 owner가 문서를 생성·중첩·편집하고 Issue와 typed link로 연결한다.

공통/DB: `documents`, `document_issue_links`, owner FK·cycle 규칙. BE: CRUD, parent/owner 검증. FE: tree, plain editor, link picker, loading/empty/error 상태. 검증: owner-one/owner-two·cycle·reload API/DB/browser flow.

비범위: TipTap, 권한 공유, 범용 polymorphic link. trust: capture/AI proposal은 변경하지 않는다.

선행: YG-01 migration 충돌이 해결된 전용 DB에서만 migration/test를 실행한다.
