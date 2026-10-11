# YG-18 — 구글 로그인 + 허용 이메일 제한

## 승인과 목표

사용자의 2026-10-11 작업 지시(GitHub #33)가 구현 승인이다. 운영 환경에서 owner가 브라우저로 Google 로그인하고 PAT를 발급할 수 있다. 실제 Google 연동 확인은 YG-20.

## 범위와 계약

- BE: 공개 `GET /api/config` → `{ supabaseUrl, supabaseAnonKey }`만. `requireUser`는 Supabase `/auth/v1/user` 검증 후 이메일을 `YGGDRASIL_ALLOWED_EMAILS`(쉼표 구분, 대소문자 무시)와 대조한다. production에서 빈 목록은 전부 거부, 그 외 환경에서 빈 목록은 허용. `/mcp` PAT 경로와 dev owner(`YGGDRASIL_DEV_OWNER_ID`, 비운영·무토큰) 동작은 그대로.
- FE: `LoginView`가 토큰 붙여넣기를 대체한다. Supabase Auth REST + PKCE(`/auth/v1/authorize?provider=google` → `?code` → `grant_type=pkce` 교환), localStorage 세션, 만료 1분 전 `refresh_token` 갱신, `/auth/v1/logout` 후 로그아웃. Supabase 미설정 시 dev owner 안내.
- 새 의존성, migration 없음. 비범위: 다중 사용자, 다른 provider, 탭 간 refresh 조율.

## 파일

`src/server/auth.ts`, `src/server/routes/health.ts`, `src/client/LoginView.tsx`, `src/client/main.tsx`, `.env.example`, `test/auth.test.ts`, `test/health.test.ts`.

## 검증

```sh
export DATABASE_URL=postgres://yggdrasil:yggdrasil@127.0.0.1:54330/yggdrasil_yg18
npm run db:migrate && npm test && npm run typecheck && npm run build && git diff --check
```
