# Paperclip Capability Analysis Prompt

아래 요청을 그대로 수행해 주세요.

---

당신은 오픈소스 AI 에이전트 운영 도구를 분석하는 시니어 제품 엔지니어입니다.

`PaperclipAI/paperclip`의 현재 기능을 공식 문서와 공식 GitHub 저장소를 근거로 조사해 주세요.

## 조사 목적

Paperclip을 fork·확장할지, plugin으로 보완할지, 기능만 참고해 별도 제품 `Yggdrasil`을 clean-room으로 만들지 결정하려고 합니다.

Yggdrasil은 한 사람이 여러 제품과 AI 동료를 함께 운영하는 공간을 지향합니다. 아이디어, 목표, 문서, 작업, 실행 결과가 흩어지지 않고 하나의 흐름으로 이어지며, 사람은 방향과 승인을 맡고 AI는 실제 일을 수행합니다. 처음에는 개인용이지만 나중에는 다른 1인 개발자나 작은 팀도 사용할 수 있어야 합니다.

## 조사 원칙

- 2026년 8월 현재 정보 기준으로 조사합니다.
- GitHub README, `docs.paperclip.ing`, `PaperclipAI` 공식 GitHub 코드·Issues·Releases를 우선 사용합니다.
- Reddit, 개인 블로그, 검색 결과 요약, 홍보성 2차 자료는 공식 자료로 답할 수 없을 때만 보조로 사용합니다.
- README의 주장과 실제 구현을 구분합니다.
- 모든 기능을 `구현됨 / 부분 구현 / roadmap / 판단 불가` 중 하나로 표시합니다.
- 중요한 판단마다 근거 URL 또는 공식 저장소의 코드 경로를 붙입니다.
- 문서에 없다는 이유만으로 미구현이라고 단정하지 말고, 필요한 경우 코드와 테스트를 확인합니다.
- 코드 전체를 리뷰하지 말고 핵심 동작이 실제로 강제되는지만 확인합니다.
- 설치·실행하거나 파일을 수정하지 말고, 이번 단계에서는 읽기 전용 조사만 수행합니다.

## 1. 제품 정의

다음을 조사해 주세요.

- Paperclip은 누구를 위한 제품인가?
- 어떤 핵심 문제를 해결하는가?
- 인간과 AI agent 중 누가 주 사용자·주 행위자인가?
- task manager, agent orchestrator, control plane 중 무엇에 가까운가?
- 로컬 도구, self-hosted 제품, hosted service 중 어디까지 지원하는가?
- Paperclip이 공식적으로 명시한 non-goal은 무엇인가?
- Paperclip을 사용하지 않는 편이 나은 사용자는 누구인가?

## 2. 핵심 데이터 모델

아래 entity의 의미, 주요 필드, 관계, lifecycle을 조사해 주세요.

- Company
- Project
- Goal
- Issue 또는 Task
- Agent
- Run
- Heartbeat
- Approval
- Activity
- Budget·Cost
- Skill
- Workspace
- Session
- API Key·Token
- Plugin

가능하면 Mermaid ER diagram 또는 관계도로 표현해 주세요.

각 entity가 다음 중 무엇인지도 구분합니다.

- 실제 DB entity
- 계산된 projection
- UI에서만 사용하는 개념
- 문서상 개념이지만 구현 여부 불명

## 3. End-to-End 사용자 흐름

다음 흐름을 실제 API·UI·코드 근거와 연결해 설명해 주세요.

### 초기 설정

```text
설치
→ Company 생성
→ Company goal 설정
→ Agent 등록
→ 역할·상사·예산·adapter 설정
→ 첫 작업 생성
```

### 작업 실행

```text
Issue 생성
→ Agent에게 배정
→ Heartbeat trigger
→ Agent runtime 실행
→ Issue checkout
→ 실제 작업
→ 결과·비용·session 기록
→ 상태 변경
```

### 인간 승인

```text
Agent가 승인 대상 action 제안
→ Approval 대기
→ 인간 승인 또는 거절
→ 다음 실행 허용 또는 차단
```

### 실패와 재개

```text
Agent 오류·중단·timeout
→ Run 결과 기록
→ Workspace·Session 유지 여부 판단
→ 재시도 또는 다음 Heartbeat에서 재개
```

## 4. Agent 실행 방식

- Claude Code, Codex, Process, HTTP adapter를 각각 어떻게 실행하는가?
- 서버가 local process를 spawn하는가, 외부 runtime을 호출하는가?
- agent별 workspace와 working directory는 어떻게 정해지는가?
- Git worktree 격리를 기본 제공하는가?
- agent에게 어떤 환경변수, prompt, skill, API key를 주입하는가?
- session context는 heartbeat 사이에 어떻게 유지되는가?
- 여러 agent를 동시에 실행할 수 있는가?
- concurrency·rate limit·resource limit은 무엇인가?
- 실행 중단·취소·재시작·resume이 가능한가?
- agent가 완료를 주장했을 때 검증 결과나 artifact를 요구하는가?

## 5. 작업 관리

- task hierarchy와 parent-child 관계
- status 종류와 상태 전이 규칙
- assignee와 delegation
- priority
- dependency
- backlog
- comment·mention
- artifact·result·evidence
- verification 상태
- 작업 lease 또는 checkout
- WIP limit
- 중복 실행 방지
- stale task·abandoned run 처리

특히 아래를 코드와 테스트로 확인해 주세요.

> 두 agent가 같은 Issue를 동시에 checkout할 때 DB transaction, conditional update, lock 또는 constraint로 실제 차단되는가?

## 6. 조직과 거버넌스

- agent 조직도와 reporting line
- CEO·manager·subordinate의 의미
- agent 생성·수정·중단 권한
- delegation 규칙
- approval 종류
- budget override
- human board의 권한
- agent별 permission·scope
- company 간 데이터 격리
- pause·terminate·resume
- immutable 또는 append-only audit log
- rollback·revision history

## 7. 비용 관리

- 어떤 provider와 agent runtime의 사용량을 읽는가?
- token·cost 계산 방식
- 월 예산과 lifetime 예산
- warning threshold와 hard stop
- 예산 초과 시 실제 다음 heartbeat 실행이 차단되는가?
- budget override 승인 흐름
- task·agent·project·company별 집계 여부
- 알 수 없는 비용 또는 누락된 usage 처리

## 8. MCP·REST API·Plugin

- Paperclip 자체 MCP endpoint의 기능
- 외부 Claude·Codex·IDE가 Paperclip을 조작하는 방법
- Paperclip agent가 외부 MCP server를 사용하는 방법
- MCP gateway·proxy 기능
- REST API 범위
- API key·PAT·scope·revocation
- plugin 설치·upgrade·uninstall
- plugin permission·capability 선언
- plugin-owned DB schema·storage
- GitHub, Slack, Linear 등 공식 integration 또는 roadmap

## 9. 문서와 지식 관리

Yggdrasil과 차이가 클 수 있으므로 자세히 확인해 주세요.

- 일반 문서·wiki 작성
- 프로젝트별 문서
- PRD·spec·decision record
- full-text search
- agent의 문서 조회·생성·수정
- task와 문서 연결
- 파일 첨부
- Markdown·Git 연동
- Notion import·export
- knowledge base
- 문서 권한
- 문서 version history

기능이 없다면 `없음`, plugin으로 가능한 경우 `plugin 가능`, roadmap이면 `roadmap`으로 구분합니다.

## 10. 배포와 운영

- `npx`, source clone, Docker 설치 방식
- embedded PostgreSQL
- Docker PostgreSQL
- hosted PostgreSQL·Supabase
- DB migration 생성·실행 방식
- backup·restore·retention
- local disk·object storage
- secret encryption·master key
- local trusted·LAN·Tailscale·authenticated mode
- single-user·multi-user
- hosted 배포
- health check·logs·metrics
- background scheduler
- scale-to-zero 환경과 heartbeat 호환성
- 항상 실행 중인 서버가 필요한 기능

## 11. UI 화면 인벤토리

실제 화면과 각 화면에서 가능한 action을 정리해 주세요.

- Dashboard
- Company
- Goal
- Project
- Issue·Task
- Agent
- Org chart
- Run detail
- Approval queue
- Cost·Budget
- Settings
- Plugin
- Activity log
- Workspace·Session

각 화면에 대해 다음을 표로 작성합니다.

- 화면명
- 목적
- 주요 표시 정보
- 생성·수정·삭제·실행 action
- 구현 상태
- 근거

## 12. 성숙도와 한계

- stable·beta·experimental·roadmap 구분
- README에는 있지만 구현되지 않은 주장
- 최근 release 빈도
- breaking change 가능성
- 자동화 테스트 범위
- 보안 정책과 알려진 보안 위험
- 주요 open issue
- self-host 난이도
- production 사용 사례
- contributor·maintainer 활동
- 현재 구조에서 확장하기 어려운 영역

## 핵심 Enforcement 코드 검증

다음 항목은 문서 요약으로 끝내지 말고 실제 코드 또는 테스트 경로를 확인해 주세요.

1. Atomic checkout이 DB에서 실제로 보장되는가?
2. Budget 초과가 실제 agent 실행을 차단하는가?
3. Approval 전 중요 mutation·실행이 실제 차단되는가?
4. Agent session이 heartbeat 사이에 실제 유지되는가?
5. Company 간 데이터가 query·API 수준에서 격리되는가?
6. Secret이 어떤 방식으로 암호화·저장되는가?
7. Agent 취소 요청이 실제 child process·remote run을 중단하는가?
8. Run·Activity 기록이 append-only인가, 수정·삭제 가능한가?

각 항목은 아래 형식으로 답합니다.

```text
- 판정: 보장 / 부분 보장 / 보장 안 됨 / 판단 불가
- 메커니즘:
- 근거 코드:
- 관련 테스트:
- 우회 또는 실패 가능성:
```

## 최종 산출물

아래 순서로 보고서를 작성해 주세요.

### A. 한 문단 제품 요약

Paperclip이 실제로 무엇을 하는 제품인지 기술 목록 없이 설명합니다.

### B. 핵심 Entity 관계도

Mermaid 또는 텍스트 트리로 작성합니다.

### C. 주요 사용자 흐름

설치부터 agent 실행, 승인, 완료, 실패 재개까지 설명합니다.

### D. 기능 매트릭스

| 영역 | 기능 | 상태 | 실제 강제 여부 | 근거 |
|---|---|---|---|---|

상태는 `구현됨 / 부분 구현 / roadmap / 판단 불가`만 사용합니다.

### E. Paperclip의 강점 5개

기능 개수가 아니라 구조적 강점을 씁니다.

### F. Paperclip의 구조적 한계 5개

Yggdrasil 목적과 비교해 설명합니다.

### G. Yggdrasil 의사결정 매트릭스

| Paperclip 기능 | 그대로 사용 | 수정해서 사용 | Yggdrasil에서 제외 | Yggdrasil 고유 구현 | 이유 |
|---|---:|---:|---:|---:|---|

### H. 구현 전략 추천

아래 중 하나만 최종 추천합니다.

- Paperclip fork
- Paperclip plugin
- Paperclip 일부 package·코드 재사용
- 독립 clean-room 구현

추천 시 다음을 포함합니다.

- 이유
- 재사용 가능한 범위
- 새로 만들어야 할 범위
- 라이선스·저작권 고지 고려사항
- 포트폴리오에서 upstream과 본인 기여를 구분하는 방법

### I. 로컬 직접 검증 체크리스트 10개

문서 조사만으로 확정할 수 없어 실제 Paperclip을 실행해 확인해야 할 항목을 우선순위순으로 작성합니다.

### J. 열린 질문

추가 사용자 결정이나 로컬 검증 없이는 답할 수 없는 내용을 적습니다.

## 응답 품질 기준

- 일반론을 피합니다.
- 기능 수를 부풀리지 않습니다.
- UI에 보인다는 것과 서버가 강제한다는 것을 구분합니다.
- `없다`와 `찾지 못했다`를 구분합니다.
- Paperclip에 유리하거나 Yggdrasil에 유리하도록 결론을 편향하지 않습니다.
- 최종 추천은 하나만 선택합니다.
- 모든 중요한 판단에 공식 근거를 붙입니다.
