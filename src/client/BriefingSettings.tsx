import { FormEvent, useEffect, useState } from 'react';
import { Send } from 'lucide-react';
import type { BriefingSettings as Settings } from '../contracts/items.js';

/** YG-29 아침 브리핑: on/off, send time (KST), test send. Telegram secrets live on the server (docs/deploy/briefing.md). */
export function BriefingSettings({ token }: { token: string }) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [form, setForm] = useState({ enabled: true, sendTime: '07:00' });
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [sending, setSending] = useState(false);
  const headers: Record<string, string> = token ? { authorization: `Bearer ${token}` } : {};

  const apply = (next: Settings) => { setSettings(next); setForm({ enabled: next.enabled, sendTime: next.sendTime }); };
  useEffect(() => {
    void (async () => {
      try {
        const response = await fetch('/api/briefing/settings', { headers });
        if (!response.ok) throw new Error();
        apply(await response.json());
      } catch { setError('브리핑 설정을 불러오지 못했습니다.'); }
    })();
  }, [token]);

  async function save(event: FormEvent) {
    event.preventDefault(); setError(''); setNotice('');
    try {
      const response = await fetch('/api/briefing/settings', { method: 'PUT', headers: { ...headers, 'content-type': 'application/json' }, body: JSON.stringify(form) });
      if (!response.ok) throw new Error(response.status === 400 ? '시간은 HH:mm 형식이어야 합니다.' : '저장하지 못했습니다.');
      apply(await response.json()); setNotice('저장했습니다.');
    } catch (failure) { setError(failure instanceof Error ? failure.message : '저장하지 못했습니다.'); }
  }

  async function test() {
    setError(''); setNotice(''); setSending(true);
    try {
      const response = await fetch('/api/briefing/test', { method: 'POST', headers });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(response.status === 403 ? '브리핑 소유자 계정(BRIEFING_OWNER_ID)만 보낼 수 있습니다.' : result.error || '보내지 못했습니다.');
      setNotice('텔레그램으로 보냈습니다.');
    } catch (failure) { setError(failure instanceof Error ? failure.message : '보내지 못했습니다.'); }
    finally { setSending(false); }
  }

  const ready = settings && settings.missing.length === 0;
  return <section aria-label="아침 브리핑" className="card p-4">
    <h2 className="text-lg font-semibold">아침 브리핑</h2>
    <p className="text-sm text-muted">매일 정한 시각(한국 시간) 이후 첫 예약 실행 때 오늘 할 일·밀린 일·반복 일정을 텔레그램으로 한 번 보냅니다. 예약은 30분마다 돌아서 최대 30분 늦을 수 있습니다.</p>
    {settings && !ready && <p role="note" className="mt-3 rounded-md border border-dashed border-line-strong p-3 text-sm text-muted">
      텔레그램이 아직 연결되지 않았습니다(서버에 <code className="font-mono text-xs">{settings.missing.join(', ')}</code> 없음). @BotFather로 봇을 만들고 <code className="font-mono text-xs">scripts/briefing-setup.sh</code>로 비밀을 등록한 뒤 재배포하세요. 안내: <code className="font-mono text-xs">docs/deploy/briefing.md</code>
    </p>}
    <form onSubmit={save} className="mt-3 flex flex-wrap items-end gap-3">
      <label className="flex h-8 items-center gap-2 text-sm"><input type="checkbox" checked={form.enabled} onChange={(event) => setForm({ ...form, enabled: event.target.checked })} />매일 보내기</label>
      <label className="w-28"><span className="label">보낼 시각</span>
        <input type="time" required className="field" value={form.sendTime} onChange={(event) => setForm({ ...form, sendTime: event.target.value })} /></label>
      <button className="btn btn-primary h-8" disabled={!settings}>저장</button>
      <button type="button" className="btn h-8" disabled={!ready || !settings?.isOwner || sending} onClick={() => void test()}><Send />{sending ? '보내는 중…' : '지금 테스트 보내기'}</button>
    </form>
    {settings && <p className="mt-2 text-xs text-faint">마지막 발송: {settings.lastSentDate ?? '없음'}{ready && !settings.isOwner ? ' · 이 계정은 브리핑 소유자가 아닙니다' : ''}</p>}
    {error && <p role="alert" className="alert mt-3">{error}</p>}
    {notice && <p role="status" className="mt-3 text-sm text-muted">{notice}</p>}
  </section>;
}
