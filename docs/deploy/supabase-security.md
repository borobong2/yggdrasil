# Supabase 보안: Data API 차단

Supabase는 `public` 스키마를 Data API(PostgREST)로 `anon`·`authenticated` 역할에 노출한다. anon key는 `GET /api/config`로 공개되므로, 앱 데이터는 Data API로 읽고 쓸 수 없어야 한다. 앱은 테이블 소유자(`postgres`)로 직접 접속하므로 아래 조치의 영향을 받지 않는다.

## 1층: 마이그레이션 `drizzle/0011_enable_rls.sql`

- `public`의 모든 테이블에 `ENABLE ROW LEVEL SECURITY` (정책 없음 = 비소유자 전부 거부). `FORCE`는 쓰지 않는다 — 소유자인 앱이 막힌다.
- `anon`·`authenticated` 역할이 있을 때만: 테이블·시퀀스 권한 `REVOKE ALL`, 이후 생성 객체의 기본 권한도 회수. 로컬 Postgres에는 이 역할이 없어 건너뛴다.
- 새 테이블을 추가하면 같은 마이그레이션에서 RLS를 켤 것. 빠뜨리면 `test/rls.test.ts`가 실패한다.

## 2층: 대시보드에서 Data API 끄기

Supabase 대시보드 → Project Settings → API(Data API)에서 Data API를 비활성화한다(또는 Exposed schemas에서 `public` 제거). 앱은 Data API를 쓰지 않는다.

## 확인

```sh
curl -s "${SUPABASE_URL}/rest/v1/issues?select=*" \
  -H "apikey: ${SUPABASE_ANON_KEY}" -H "Authorization: Bearer ${SUPABASE_ANON_KEY}"
```

기대값: `[]`(RLS) 또는 권한 오류(`permission denied for table issues`, 42501) — Data API를 끈 뒤에는 404/스키마 노출 오류. 데이터 행이 보이면 배포 중단.
