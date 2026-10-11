import { useEffect, useState } from 'react';

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
  if (!response.ok) throw new Error('Sign-in failed.');
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

export function LoginView({ token, onToken }: { token: string; onToken: (token: string) => void }) {
  const [config, setConfig] = useState<Config | null>(null);
  const [session, setSession] = useState<Session | null>(readSession);
  const [error, setError] = useState('');

  function apply(next: Session | null) {
    storeSession(next);
    setSession(next);
    onToken(next?.access_token ?? '');
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
      } catch (caught) { setError(caught instanceof Error ? caught.message : 'Sign-in failed.'); }
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
        .catch(() => { apply(null); setError('Session expired. Sign in again.'); });
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

  return <section aria-label="Session">
    <h2>Session</h2>
    {error && <p role="alert">{error}</p>}
    {session
      ? <p>Signed in{session.user?.email ? ` as ${session.user.email}` : ''}. <button type="button" onClick={() => void signOut()}>Sign out</button></p>
      : config?.supabaseUrl
        ? <button type="button" onClick={() => void signIn(config).catch(() => setError('Sign-in failed.'))}>Google로 로그인</button>
        : <p>{config ? 'Supabase is not configured; using the local development owner.' : 'Loading…'}</p>}
  </section>;
}
