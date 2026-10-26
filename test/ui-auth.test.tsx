// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { LoginScreen, readSession, SessionPanel, useAuth } from '../src/client/LoginView';
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const config = { supabaseUrl: 'https://auth.example.test', supabaseAnonKey: 'public' };
const session = { access_token: 'access', refresh_token: 'refresh', expires_at: Math.floor(Date.now() / 1000) + 3600, user: { email: 'owner@example.test' } };
beforeEach(() => { localStorage.clear(); sessionStorage.clear(); history.replaceState(null, '', '/'); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); });
it('reads absent/corrupt/stored sessions safely', () => {
  expect(readSession()).toBeNull(); localStorage.setItem('yggdrasil-auth', '{'); expect(readSession()).toBeNull(); localStorage.setItem('yggdrasil-auth', JSON.stringify(session)); expect(readSession()).toEqual(session);
});
it('exchanges PKCE callback once, removes verifier and URL code, then logs out even offline', async () => {
  history.replaceState(null, '', '/?code=auth-code'); sessionStorage.setItem('yggdrasil-pkce-verifier', 'verifier');
  const fetcher = vi.fn().mockResolvedValueOnce(json(config)).mockResolvedValueOnce(json({ access_token: 'access', refresh_token: 'refresh', expires_in: 7200 })).mockRejectedValueOnce(new Error('offline')); vi.stubGlobal('fetch', fetcher);
  const { result } = renderHook(useAuth); await waitFor(() => expect(result.current.token).toBe('access'));
  expect(location.search).toBe(''); expect(sessionStorage.getItem('yggdrasil-pkce-verifier')).toBeNull(); expect(JSON.parse(fetcher.mock.calls[1][1].body)).toEqual({ auth_code: 'auth-code', code_verifier: 'verifier' });
  act(() => result.current.signOut()); await waitFor(() => expect(result.current.session).toBeNull()); expect(localStorage.getItem('yggdrasil-auth')).toBeNull();
});
it('reports PKCE rejection without storing a token', async () => {
  history.replaceState(null, '', '/?code=bad'); sessionStorage.setItem('yggdrasil-pkce-verifier', 'verifier');
  vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(json(config)).mockResolvedValueOnce(json({}, 401)));
  const { result } = renderHook(useAuth); await waitFor(() => expect(result.current.error).toContain('로그인하지')); expect(result.current.token).toBe('');
});
it.each([true, false])('refreshes expired session or clears it on failure (%s)', async success => {
  localStorage.setItem('yggdrasil-auth', JSON.stringify({ ...session, expires_at: 0 }));
  const fetcher = vi.fn().mockResolvedValueOnce(json(config)).mockImplementation(async () => json({ ...session, access_token: 'new-access' }, success ? 200 : 401)); vi.stubGlobal('fetch', fetcher);
  const { result } = renderHook(useAuth);
  await waitFor(() => expect(result.current.token).toBe(success ? 'new-access' : ''));
  expect(fetcher.mock.calls[1][0]).toContain('grant_type=refresh_token'); if (!success) expect(result.current.error).toContain('세션이 만료');
});
it('handles config failure and unavailable sign-in cryptography', async () => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline'))); const { result, unmount } = renderHook(useAuth);
  await waitFor(() => expect(result.current.error).toBe('offline')); act(() => result.current.signIn()); unmount();
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json(config))); vi.stubGlobal('crypto', { getRandomValues: () => { throw new Error('unavailable'); } });
  const second = renderHook(useAuth); await waitFor(() => expect(second.result.current.config).toEqual(config)); act(() => second.result.current.signIn()); await waitFor(() => expect(second.result.current.error).toContain('로그인하지'));
});
it('renders login, local development and signed-in session actions', () => {
  const signIn = vi.fn(), signOut = vi.fn(); const base = { config: null, session: null, token: '', error: 'Try again', signIn, signOut };
  const { rerender } = render(<LoginScreen auth={base} />); expect(screen.getByRole('alert').textContent).toBe('Try again'); fireEvent.click(screen.getByText('Google로 로그인')); expect(signIn).toHaveBeenCalledTimes(1);
  rerender(<SessionPanel auth={base} />); expect(screen.getByText(/로컬 개발 소유자/)).toBeTruthy();
  rerender(<SessionPanel auth={{ ...base, config }} />); fireEvent.click(screen.getByText('Google로 로그인'));
  rerender(<SessionPanel auth={{ ...base, config, session }} />); expect(screen.getByText('owner@example.test')).toBeTruthy(); fireEvent.click(screen.getByText('로그아웃')); expect(signOut).toHaveBeenCalledTimes(1);
});
