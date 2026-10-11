# YG-20 — Cloud Run 배포 런북

개인 GCP 프로젝트의 Cloud Run 서비스 1개(React 빌드 + Hono API + `/mcp`)와 Supabase(Postgres + Google 로그인)로 운영한다. 비용 목표는 무료 한도 안에서 ≈ 0원.

- 리전: `asia-northeast3`(서울), 서비스·Artifact Registry 저장소 이름: `yggdrasil`
- 스크립트: [`scripts/deploy.sh`](../../scripts/deploy.sh), [`scripts/backup/`](../../scripts/backup/)
- 데이터 이전·owner remap·SSL: [data-migration.md](data-migration.md) (YG-19)
- 로그인 허용 이메일·`GET /api/config`: YG-18

> 이 맥의 gcloud 기본 설정은 **회사 계정**이다. 모든 gcloud 명령은 `CLOUDSDK_ACTIVE_CONFIG_NAME=personal`로 실행한다. `deploy.sh`는 활성 계정이 `@creatived.kr`이거나 프로젝트가 `sokind-ai`면 아무것도 하지 않고 멈춘다.

## 0. 소유자 준비 (한 번)

### gcloud `personal` 설정

```sh
gcloud config configurations create personal --no-activate
CLOUDSDK_ACTIVE_CONFIG_NAME=personal gcloud auth login          # 개인 구글 계정
CLOUDSDK_ACTIVE_CONFIG_NAME=personal gcloud config set account <개인 이메일>
export P=<PROJECT_ID>                                          # 이후 명령에서 사용
```

기본 설정(회사)은 건드리지 않는다. 쉘마다 `export CLOUDSDK_ACTIVE_CONFIG_NAME=personal`을 해 두면 편하다.

### GCP 프로젝트 + 결제 + 예산

1. [콘솔](https://console.cloud.google.com/projectcreate)에서 개인 계정으로 프로젝트 생성(조직 없음). 프로젝트 ID를 `P`로 기록.
2. 결제 → 개인 결제 계정 연결.
3. 예산 알림 5,000원: `deploy.sh` 마지막에 출력되는 `gcloud billing budgets create …` 명령을 실행하거나, 콘솔 결제 → 예산 및 알림에서 같은 값(50/90/100%)으로 만든다. 예산은 알림일 뿐 사용을 막지 않는다.
4. Cloud Run URL은 `https://yggdrasil-<PROJECT_NUMBER>.asia-northeast3.run.app` 형식으로 미리 정해진다.
   `gcloud projects describe $P --format='value(projectNumber)'`로 번호를 확인해 아래 OAuth·Supabase 설정에 쓴다(첫 배포 후 `deploy.sh`가 실제 URL을 출력하니 대조).

### Supabase 프로젝트

- 조직 `personal` → 프로젝트 `yggdrasil`, 리전 Northeast Asia (Seoul), Free 플랜.
- DB 비밀번호는 비밀번호 관리자에 저장.
- Project Settings → API: `Project URL`(= `SUPABASE_URL`), `anon` key(= `SUPABASE_ANON_KEY`).
- Connect → **Session pooler** 연결 문자열(= `DATABASE_URL`, 포트 5432).
  Cloud Run 아웃바운드는 IPv4라 직접 연결(IPv6 전용) 대신 pooler를 쓴다. 트랜잭션 pooler(6543)는 마이그레이션에 쓰지 않는다. SSL 파라미터는 [data-migration.md](data-migration.md)(YG-19)를 따른다.
- Free 프로젝트는 7일간 활동이 없으면 일시정지될 수 있다. 매일 백업(6단계)이 접속을 만들지만, 정지되면 대시보드에서 Restore.

### Google OAuth 클라이언트 (Supabase Google 로그인용)

GCP 콘솔(같은 개인 프로젝트) → API 및 서비스:

1. OAuth 동의 화면: External, 앱 이름 `Yggdrasil`, 테스트 사용자에 본인 Gmail 추가(게시하지 않아도 됨).
2. 사용자 인증 정보 → OAuth 클라이언트 ID → 웹 애플리케이션
   - 승인된 JavaScript 원본: `https://yggdrasil-<PROJECT_NUMBER>.asia-northeast3.run.app`
   - 승인된 리디렉션 URI: `https://<SUPABASE_REF>.supabase.co/auth/v1/callback`
3. Supabase → Authentication → Sign In / Providers → Google: 클라이언트 ID/보안 비밀 입력, 사용.

### Supabase Auth 설정

Authentication → URL Configuration:

- Site URL: `https://yggdrasil-<PROJECT_NUMBER>.asia-northeast3.run.app`
- Redirect URLs: `https://yggdrasil-<PROJECT_NUMBER>.asia-northeast3.run.app/**` (로컬 확인용이면 `http://127.0.0.1:3000/**` 추가)

새 가입 차단은 **첫 로그인 이후**(4단계) Authentication → Sign In / Providers → "Allow new users to sign up" 끄기. 서버도 `YGGDRASIL_ALLOWED_EMAILS`(YG-18)로 한 번 더 막는다.

### 로컬 도구

`docker`(buildx 포함), `gcloud`, `brew install libpq`(pg_dump 17, 백업용).

## 1. Supabase 스키마 마이그레이션

```sh
read -rs DATABASE_URL && export DATABASE_URL   # session pooler URL 붙여넣기 (화면에 안 나옴)
npm run db:migrate
```

컨테이너도 시작할 때마다 `db:migrate`를 돌리므로(이미 적용된 건 건너뜀) 생략해도 되지만, 배포 전에 연결을 확인하는 용도로 먼저 한다.

## 2. 비밀 값 등록 + 배포

비밀 값은 stdin으로만 받는다(터미널에서 실행하면 입력이 숨겨지고, 파이프도 된다).

```sh
export CLOUDSDK_ACTIVE_CONFIG_NAME=personal
scripts/deploy.sh $P secret DATABASE_URL
scripts/deploy.sh $P secret SUPABASE_URL
scripts/deploy.sh $P secret SUPABASE_ANON_KEY
scripts/deploy.sh $P secret YGGDRASIL_ALLOWED_EMAILS     # 예: me@gmail.com (쉼표 구분)
scripts/deploy.sh $P secret OPENAI_API_KEY               # 선택. 없으면 AI 제안만 꺼진다
scripts/deploy.sh $P
```

`deploy.sh <PROJECT_ID>`가 하는 일:

1. 안전장치: 활성 계정 `*@creatived.kr` 또는 프로젝트 `sokind-ai`면 중단.
2. API 사용 설정: Cloud Run, Artifact Registry, Secret Manager, IAM.
3. Artifact Registry `yggdrasil` 저장소 생성(없을 때) + 정리 정책(최신 2개만 유지, 하루 1회 정도 적용).
4. 런타임 서비스 계정 `yggdrasil-run` 생성, 각 비밀에 `secretAccessor`만 부여.
5. `linux/amd64` 이미지 빌드·푸시(태그 = git short SHA, 커밋 안 된 변경이 있으면 `-dirty-<시각>`).
6. `gcloud run deploy`: 서울, `--min-instances 0 --max-instances 1`, `--allow-unauthenticated`(앱이 자체 인증), `NODE_ENV=production`, 비밀은 Secret Manager `:latest`.
7. 서비스 URL과 예산 알림 명령 출력, `/api/health` 확인.

비밀 값을 바꾼 뒤에는 `scripts/deploy.sh $P`를 다시 실행해야 새 버전이 반영된다. 콜드 스타트(마이그레이션 확인 포함)는 몇 초 걸린다.

## 3. 첫 로그인

배포 URL에서 Google로 로그인 → 본인 데이터 화면 확인. 확인되면 Supabase에서 새 가입을 끈다(0단계 Auth 설정).

## 4. 데이터 이전 + owner remap (YG-19)

[data-migration.md](data-migration.md)를 따른다. remap에는 방금 로그인으로 생긴 Supabase 사용자 ID가 필요하므로 첫 로그인 뒤에 한다. 끝나면 새로고침해서 로컬 데이터가 보이는지 확인.

## 5. PAT 발급 + Claude MCP 주소 교체

1. 배포된 앱의 PAT 설정에서 토큰 발급(원문은 한 번만 보인다).
2. Claude Code 등록 교체:

```sh
claude mcp remove yggdrasil -s user
read -rs YGGDRASIL_PAT
claude mcp add --transport http -s user yggdrasil \
  https://yggdrasil-<PROJECT_NUMBER>.asia-northeast3.run.app/mcp \
  --header "Authorization: Bearer $YGGDRASIL_PAT"
unset YGGDRASIL_PAT
claude mcp get yggdrasil     # Status: Connected
```

3. Claude Code에서 `@yggdrasil:todo://today`를 열어 오늘 할 일이 나오는지 확인.

## 6. 매일 백업 (맥 launchd, 04:00)

`DATABASE_URL`은 **macOS 키체인**에 둔다(저장소 밖, 파일로 남지 않음). launchd 에이전트는 로그인 세션에서 돌기 때문에 로그인 키체인을 읽을 수 있다.

```sh
# 1) 키체인에 저장 (-w를 마지막에 두면 값을 프롬프트로 받음)
security add-generic-password -U -a "$(id -un)" -s yggdrasil-database-url -w

# 2) 수동 1회 실행으로 확인
scripts/backup/backup.sh            # ~/yggdrasil-backups/yggdrasil-YYYYMMDD-HHMMSS.dump

# 3) launchd 설치
mkdir -p ~/yggdrasil-backups
sed -e "s#__REPO__#$PWD#g" -e "s#__HOME__#$HOME#g" scripts/backup/dev.yggdrasil.backup.plist \
  > ~/Library/LaunchAgents/dev.yggdrasil.backup.plist
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/dev.yggdrasil.backup.plist
launchctl kickstart gui/$(id -u)/dev.yggdrasil.backup   # 지금 한 번 실행
tail ~/yggdrasil-backups/backup.log
```

- 첫 실행 때 키체인 접근 허용 창이 뜨면 "항상 허용".
- 보관: 최신 30개(`YGGDRASIL_BACKUP_KEEP`로 변경), 폴더는 `YGGDRASIL_BACKUP_DIR`.
- 범위: 앱 데이터(`public`, `drizzle` 스키마). Supabase 관리 스키마(`auth` 등)는 제외 — 사용자는 Google 재로그인으로 복구.
- 복원: `pg_restore --no-owner --clean --if-exists -d "$DATABASE_URL" ~/yggdrasil-backups/<파일>.dump`
- 제거: `launchctl bootout gui/$(id -u)/dev.yggdrasil.backup && rm ~/Library/LaunchAgents/dev.yggdrasil.backup.plist`

## 검증 체크리스트

- [ ] `curl -fsS <URL>/api/health` → `{"ok":true}`
- [ ] Google 로그인 성공, 허용 목록 밖 계정은 거부
- [ ] Supabase 새 가입 비활성화
- [ ] `claude mcp get yggdrasil` Connected, `todo://today` 응답
- [ ] `~/yggdrasil-backups`에 오늘 날짜 `.dump` 생성
- [ ] 예산 알림 5,000원 존재

## 예상 비용 (월)

개인 1명 사용 기준. 모두 무료 한도 안이라 ≈ 0원, 예산 알림이 안전망이다.

| 항목 | 무료 한도 | 예상 사용 | 예상 비용 |
| --- | --- | --- | --- |
| Cloud Run (요청 기반, min 0 / max 1) | 월 vCPU 180,000초, 메모리 360,000 GiB초, 요청 200만 | 하루 수백 요청, 유휴 시 0 인스턴스 | 0원 |
| Cloud Run → Supabase/인터넷 송신 | 소량 | 수십 MB | 0~수 원 |
| Artifact Registry | 저장 0.5 GB | 이미지 2개(정리 정책) | 0원 (한도 초과 시 GB당 $0.10) |
| Secret Manager | 활성 버전 6개, 접근 1만 회 | 비밀 4~5개 | 0원 (값을 자주 바꾸면 옛 버전도 활성으로 남음, 버전당 $0.06) |
| Supabase Free | DB 500 MB, Auth MAU 5만 | 1명, 수 MB | 0원 |
| 맥 백업 | — | 로컬 디스크 | 0원 |

비용이 생기는 경우: 이미지가 쌓여 0.5 GB를 넘거나, 비밀 버전을 많이 쌓거나, `--min-instances`를 1 이상으로 올릴 때.
