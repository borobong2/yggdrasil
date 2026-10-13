# 아침 브리핑 (YG-29)

매일 아침 텔레그램으로 오늘 할 일·밀린 일·기다리는 중·오늘 반복 일정을 한 번 보낸다. 받는 사람은 앱 소유자 한 명(`BRIEFING_OWNER_ID`)이다.

## 동작

- Cloud Scheduler `yggdrasil-briefing`(서울 리전)이 06:00–23:30 KST 동안 30분마다 `POST https://yg.justrunlab.com/api/briefing/run`을 부른다(헤더 `X-Briefing-Secret`).
- 엔드포인트는 **켜져 있고, 지금(KST) ≥ 설정한 시각이고, 오늘 아직 안 보냈을 때만** 보낸다. 보내면 `briefing_settings.last_sent_date`에 오늘(KST)을 적는다. 그래서 같은 날 여러 번 불려도 한 번만 가고, 시각을 07:15로 바꾸면 07:30 실행 때 간다(최대 30분 늦음).
- 전송이 실패하면 날짜를 적지 않으므로 다음 30분 실행이 다시 시도한다. 텔레그램 호출은 10초 타임아웃 + 1회 재시도(네트워크 오류·429·5xx).
- 설정 › 아침 브리핑: 켜기/끄기, 보낼 시각, 마지막 발송일, 「지금 테스트 보내기」(소유자만, 시각·켜짐·이미 보냄을 무시하고 보내며 날짜는 적지 않는다).
- 비밀이 하나라도 없으면 `/api/briefing/run`·테스트는 503과 빠진 이름을 돌려주고 아무것도 보내지 않는다. 비밀이 틀리면 401.
- 수동 강제 실행(비밀 필요): `curl -X POST -H "X-Briefing-Secret: $S" 'https://yg.justrunlab.com/api/briefing/run?force=1'`

### 인증 선택: 공유 비밀 헤더

Cloud Run은 `--allow-unauthenticated`(앱이 자체 인증)라서 Cloud Scheduler OIDC를 쓰려면 앱이 Google ID 토큰(RS256 서명, JWKS, audience, 서비스 계정 이메일)을 직접 검증해야 한다. 새 의존성이나 JWT 검증 코드가 필요하다. 공유 비밀은 GitHub 웹훅과 같은 방식(Secret Manager 비밀 + 상수 시간 비교)이고 코드가 몇 줄이다. 대가: 헤더 값이 스케줄러 작업 설정에 저장되어 프로젝트 열람 권한자가 볼 수 있다 — 개인 프로젝트라 허용. 다른 사람이 프로젝트 권한을 갖게 되면 OIDC로 바꾼다.

## 비밀

| 이름 | 값 |
| --- | --- |
| `TELEGRAM_BOT_TOKEN` | @BotFather가 준 봇 토큰 |
| `TELEGRAM_CHAT_ID` | 받을 채팅 id (아래 3단계) |
| `BRIEFING_OWNER_ID` | 브리핑 대상 Yggdrasil 사용자 UUID (Supabase Authentication → Users의 User UID) |
| `BRIEFING_SECRET` | 스케줄러 헤더 값. 스크립트가 `openssl rand -hex 32`로 한 번 만든다 |

모두 `deploy.sh`의 선택 비밀이라, 없으면 브리핑만 꺼진 채로 배포된다.

## 설정 순서

1. **봇 만들기**: 텔레그램에서 `@BotFather` → `/newbot` → 이름과 `..._bot`으로 끝나는 사용자명 입력 → 받은 토큰(`123456:ABC…`)을 비밀번호 관리자에 저장.
2. **봇에게 말 걸기**: 새 봇을 열어 `/start`나 아무 메시지를 보낸다(봇은 먼저 말을 건 사람에게만 보낼 수 있다).
3. **chat id 얻기** (토큰이 쉘 기록에 남지 않게):
   ```sh
   read -rs TG && curl -s "https://api.telegram.org/bot$TG/getUpdates" | grep -oE '"chat":\{"id":-?[0-9]+' ; unset TG
   ```
   나온 숫자가 `TELEGRAM_CHAT_ID`. 빈 결과면 2단계 메시지를 다시 보내고 재시도.
4. **owner id**: Supabase → Authentication → Users에서 본인 User UID 복사.
5. **비밀 + 스케줄러**:
   ```sh
   export CLOUDSDK_ACTIVE_CONFIG_NAME=personal
   scripts/briefing-setup.sh $P     # 토큰, chat id, owner id를 차례로 물음(입력 숨김, 빈 값 = 기존 유지)
   scripts/deploy.sh $P             # 새 비밀을 Cloud Run에 반영
   ```
   `briefing-setup.sh`는 회사 계정/프로젝트면 멈추고, 비밀을 만들거나 새 버전을 추가하고, `BRIEFING_SECRET`이 없으면 만들고, Cloud Scheduler API를 켜고 작업을 만들거나 갱신한다. 다시 실행해도 안전하다.
6. **확인**: 설정 › 아침 브리핑에서 안내 문구가 사라졌는지 보고 「지금 테스트 보내기」.

비밀을 바꾸면 `deploy.sh`로 재배포한다. `BRIEFING_SECRET`을 바꾸면 `briefing-setup.sh`도 다시 실행해 스케줄러 헤더를 갱신한다.

## 비용

Cloud Scheduler는 결제 계정당 작업 3개 무료(이 작업 1개). 하루 36회 호출은 Cloud Run 무료 한도 안이다.
