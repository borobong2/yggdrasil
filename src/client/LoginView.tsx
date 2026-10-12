import { useEffect, useState } from 'react';
import { LogOut } from 'lucide-react';

// Supabase Auth over plain REST with PKCE: no supabase-js dependency, tokens never appear in the URL.
type Config = { supabaseUrl: string; supabaseAnonKey: string };
type Session = { access_token: string; refresh_token: string; expires_at: number; user?: { email?: string } };

const SESSION_KEY = 'yggdrasil-auth';
const VERIFIER_KEY = 'yggdrasil-pkce-verifier';

export function readSession(): Session | null {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY) ?? 'null'); } catch { return null; }
}

function storeSession(session: Session | null) {
  if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  else localStorage.removeItem(SESSION_KEY);
}

async function tokenRequest(config: Config, grant: 'pkce' | 'refresh_token', body: object): Promise<Session> {
  const response = await fetch(`${config.supabaseUrl}/auth/v1/token?grant_type=${grant}`, {
    method: 'POST',
    headers: { apikey: config.supabaseAnonKey, 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!response.ok) throw new Error('로그인하지 못했습니다.');
  const session = (await response.json()) as Session & { expires_in?: number };
  return { ...session, expires_at: session.expires_at ?? Math.floor(Date.now() / 1000) + (session.expires_in ?? 3600) };
}

function base64Url(bytes: ArrayBuffer | Uint8Array): string {
  return btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function signIn(config: Config) {
  const verifier = base64Url(crypto.getRandomValues(new Uint8Array(32)));
  sessionStorage.setItem(VERIFIER_KEY, verifier);
  const challenge = base64Url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
  const params = new URLSearchParams({
    provider: 'google',
    redirect_to: `${location.origin}${location.pathname}`,
    code_challenge: challenge,
    code_challenge_method: 's256'
  });
  location.assign(`${config.supabaseUrl}/auth/v1/authorize?${params}`);
}

export type Auth = ReturnType<typeof useAuth>;

// Owns config, PKCE callback and refresh; mounted once at the app root so refresh runs on every screen.
export function useAuth() {
  const [config, setConfig] = useState<Config | null>(null);
  const [session, setSession] = useState<Session | null>(readSession);
  const [error, setError] = useState('');
  const token = session?.access_token ?? '';

  function apply(next: Session | null) {
    storeSession(next);
    setSession(next);
  }

  useEffect(() => {
    void (async () => {
      try {
        const response = await fetch('/api/config');
        const loaded = (await response.json()) as Config;
        setConfig(loaded);
        const code = new URLSearchParams(location.search).get('code');
        const verifier = sessionStorage.getItem(VERIFIER_KEY);
        if (code && verifier && loaded.supabaseUrl) {
          sessionStorage.removeItem(VERIFIER_KEY);
          history.replaceState(null, '', location.pathname);
          apply(await tokenRequest(loaded, 'pkce', { auth_code: code, code_verifier: verifier }));
        }
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : '로그인하지 못했습니다.');
      }
    })();
  }, []);

  // Refresh one minute before expiry (immediately if already expired).
  // ponytail: one tab refreshes at a time is assumed; concurrent tabs may race on refresh-token rotation and need a re-login.
  useEffect(() => {
    if (!config?.supabaseUrl || !session) return;
    const delay = Math.max(0, session.expires_at * 1000 - Date.now() - 60_000);
    const timer = setTimeout(() => {
      tokenRequest(config, 'refresh_token', { refresh_token: session.refresh_token })
        .then(apply)
        .catch(() => { apply(null); setError('세션이 만료되었습니다. 다시 로그인하세요.'); });
    }, delay);
    return () => clearTimeout(timer);
  }, [config, session]);

  async function signOut() {
    if (config?.supabaseUrl && token) {
      await fetch(`${config.supabaseUrl}/auth/v1/logout`, {
        method: 'POST',
        headers: { apikey: config.supabaseAnonKey, authorization: `Bearer ${token}` }
      }).catch(() => undefined);
    }
    apply(null);
  }

  return {
    config, session, token, error,
    signIn: () => { if (config) void signIn(config).catch(() => setError('로그인하지 못했습니다.')); },
    signOut: () => void signOut()
  };
}

export function LoginScreen({ auth }: { auth: Auth }) {
  return <main className="grid min-h-dvh place-items-center bg-canvas px-4">
    <section aria-label="Session" className="card w-full max-w-[360px] px-7 py-8 text-center">
      <TreeMark className="mx-auto mb-4 size-10" />
      <h1 className="text-xl font-semibold tracking-tight">Yggdrasil</h1>
      <p className="mt-1 text-sm text-muted">요구, 결정, 실행 근거를 한곳에서 연결합니다.</p>
      {auth.error && <p role="alert" className="alert mt-5 text-left">{auth.error}</p>}
      <button type="button" className="btn mt-6 h-10 w-full text-base" onClick={auth.signIn}>
        <GoogleMark />Google로 로그인
      </button>
      <p className="mt-4 text-xs text-faint">허용된 계정만 접근할 수 있습니다.</p>
    </section>
  </main>;
}

export function SessionPanel({ auth }: { auth: Auth }) {
  const email = auth.session?.user?.email;
  return <section aria-label="Session" className="card p-4">
    <h2 className="text-lg font-semibold">세션</h2>
    {auth.error && <p role="alert" className="alert mt-3">{auth.error}</p>}
    <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
      {auth.session
        ? <><p className="min-w-0 text-sm text-muted">로그인됨{email && <> · <span className="break-all text-ink">{email}</span></>}</p>
          <button type="button" className="btn" onClick={auth.signOut}><LogOut />로그아웃</button></>
        : auth.config?.supabaseUrl
          ? <button type="button" className="btn" onClick={auth.signIn}><GoogleMark />Google로 로그인</button>
          : <p className="text-sm text-muted">Supabase가 설정되지 않아 로컬 개발 소유자로 동작합니다.</p>}
    </div>
  </section>;
}

export function TreeMark({ className }: { className?: string }) {
  return <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
    <rect width="32" height="32" rx="8" fill="var(--color-accent)" />
    <path d="M16 25V13M16 18l-5-4M16 16l5-4M11 14l-2-3M21 12l2-3M16 13V8" stroke="white" strokeWidth="2" strokeLinecap="round" fill="none" />
  </svg>;
}

function GoogleMark() {
  return <svg viewBox="0 0 18 18" width="16" height="16" aria-hidden="true">
    <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z" />
    <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z" />
    <path fill="#FBBC05" d="M3.97 10.72A5.4 5.4 0 0 1 3.68 9c0-.6.1-1.18.29-1.72V4.95H.96A9 9 0 0 0 0 9c0 1.45.35 2.83.96 4.05l3.01-2.33z" />
    <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58A9 9 0 0 0 9 0 9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z" />
  </svg>;
}
