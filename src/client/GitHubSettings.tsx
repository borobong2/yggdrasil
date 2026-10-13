import { FormEvent, useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { formatDateTime } from './format.js';
import type { EpicPrefix, GitHubRepo } from '../contracts/items.js';

export function GitHubSettings({ token }: { token: string }) {
  const [repos, setRepos] = useState<GitHubRepo[]>([]);
  const [fullName, setFullName] = useState('');
  const [prefix, setPrefix] = useState('YG');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const headers: Record<string, string> = token ? { authorization: `Bearer ${token}` } : {};

  async function load() {
    setLoading(true); setError('');
    try {
      const response = await fetch('/api/github/repos', { headers });
      if (!response.ok) throw new Error((await response.json()).error || '저장소를 불러오지 못했습니다.');
      setRepos(await response.json());
    } catch (error) { setError(error instanceof Error ? error.message : '저장소를 불러오지 못했습니다.'); }
    finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, [token]);

  async function add(event: FormEvent) {
    event.preventDefault(); setError('');
    try {
      const response = await fetch('/api/github/repos', { method: 'POST', headers: { ...headers, 'content-type': 'application/json' }, body: JSON.stringify({ fullName, prefix }) });
      const result = await response.json();
      if (response.status === 403) throw new Error('회사 저장소는 연결할 수 없습니다.');
      if (!response.ok) throw new Error(result.error || '저장소를 연결하지 못했습니다.');
      setFullName(''); await load();
    } catch (error) { setError(error instanceof Error ? error.message : '저장소를 연결하지 못했습니다.'); }
  }

  async function remove(id: string) {
    setError('');
    try {
      const response = await fetch(`/api/github/repos/${id}`, { method: 'DELETE', headers });
      if (!response.ok) throw new Error('연결을 해제하지 못했습니다.');
      setRepos((current) => current.filter((item) => item.id !== id));
    } catch (error) { setError(error instanceof Error ? error.message : '연결을 해제하지 못했습니다.'); }
  }

  return <section aria-label="GitHub 연결" className="card p-4">
    <h2 className="text-lg font-semibold">GitHub 연결</h2>
    <p className="text-sm text-muted">브랜치·PR 제목에 <code className="font-mono text-xs">YG-24</code> 같은 키가 있으면 상태·CI·배포를 이슈에 반영합니다. 웹훅 등록은 <code className="font-mono text-xs">scripts/connect-repo.sh</code>로 합니다.</p>
    <form onSubmit={add} className="mt-3 flex items-end gap-2">
      <div className="min-w-0 flex-1"><label htmlFor="github-repo" className="label">저장소</label>
        <input id="github-repo" className="field" placeholder="borobong2/yggdrasil" value={fullName} onChange={(event) => setFullName(event.target.value)} required pattern="[A-Za-z0-9\-]+/[A-Za-z0-9._\-]+" /></div>
      <div className="w-20"><label htmlFor="github-prefix" className="label">키 접두어</label>
        <input id="github-prefix" className="field font-mono uppercase" value={prefix} onChange={(event) => setPrefix(event.target.value)} required maxLength={10} pattern="[A-Za-z][A-Za-z0-9]*" /></div>
      <button className="btn btn-primary h-8"><Plus />연결</button>
    </form>
    {error && <p role="alert" className="alert mt-3">{error}</p>}
    {loading ? <p role="status" className="mt-3 text-sm text-faint">저장소를 불러오는 중…</p> : repos.length === 0 ? <p className="mt-3 text-sm text-faint">연결된 저장소가 없습니다.</p>
      : <ul className="mt-3 divide-y divide-line rounded-md border border-line">{repos.map((item) => <li key={item.id} className="flex items-center gap-3 px-3 py-2 text-sm">
        <span className="badge font-mono">{item.prefix}</span>
        <a href={`https://github.com/${item.fullName}`} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate font-medium hover:underline">{item.fullName}</a>
        <span className="hidden max-w-[45%] truncate text-xs text-faint sm:inline" title={item.lastStatus ?? undefined}>{item.lastEventAt ? `${formatDateTime(item.lastEventAt)} · ${item.lastStatus ?? ''}` : '이벤트 없음'}</span>
        <button type="button" className="btn btn-ghost btn-danger h-7 px-2" onClick={() => void remove(item.id)}>해제</button>
      </li>)}</ul>}
  </section>;
}

/** YG-36: epic default ticket prefixes. The start number only ever raises the counter, so existing keys never repeat. */
export function TicketPrefixSettings({ token }: { token: string }) {
  const [rows, setRows] = useState<EpicPrefix[]>([]);
  const [form, setForm] = useState({ epicId: '', prefix: '', start: '' });
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const headers: Record<string, string> = token ? { authorization: `Bearer ${token}` } : {};

  async function load() {
    try {
      const response = await fetch('/api/ticket-prefixes', { headers });
      if (!response.ok) throw new Error();
      setRows(await response.json());
    } catch { setError('티켓 접두사를 불러오지 못했습니다.'); }
  }
  useEffect(() => { void load(); }, [token]);

  const edit = (row: EpicPrefix) => setForm({ epicId: row.epicId, prefix: row.keyPrefix ?? '', start: '' });
  async function save(event: FormEvent) {
    event.preventDefault(); setError(''); setNotice('');
    try {
      const body = { prefix: form.prefix.trim() || null, ...(form.start ? { start: Number(form.start) } : {}) };
      const response = await fetch(`/api/ticket-prefixes/${form.epicId}`, { method: 'PUT', headers: { ...headers, 'content-type': 'application/json' }, body: JSON.stringify(body) });
      if (!response.ok) throw new Error(response.status === 400 ? '접두사는 영문으로 시작하는 1~10자(영문·숫자), 시작 번호는 1 이상입니다.' : '저장하지 못했습니다.');
      const saved: EpicPrefix = await response.json();
      setRows((current) => current.map((row) => row.epicId === saved.epicId ? saved : row));
      setNotice(saved.keyPrefix ? `${saved.area} › ${saved.epic}: 다음 키 ${saved.keyPrefix}-${saved.nextNumber ?? 1}` : `${saved.area} › ${saved.epic}: 기본 접두사를 지웠습니다.`);
      setForm({ epicId: '', prefix: '', start: '' });
    } catch (failure) { setError(failure instanceof Error ? failure.message : '저장하지 못했습니다.'); }
  }

  const prefixed = rows.filter((row) => row.keyPrefix);
  return <section aria-label="티켓 접두사" className="card p-4">
    <h2 className="text-lg font-semibold">티켓 접두사</h2>
    <p className="text-sm text-muted">에픽에 접두사를 정하면 그 에픽에 새로 만드는 할 일에 다음 키가 자동으로 붙습니다. 이미 붙은 키는 바뀌지 않고, 시작 번호는 지금보다 낮출 수 없습니다.</p>
    <form onSubmit={save} className="mt-3 flex flex-wrap items-end gap-2">
      <label className="min-w-0 flex-1 basis-48"><span className="label">에픽</span>
        <select className="field" required value={form.epicId} onChange={(event) => { const row = rows.find((item) => item.epicId === event.target.value); setForm({ epicId: event.target.value, prefix: row?.keyPrefix ?? '', start: '' }); }}>
          <option value="">에픽 선택</option>
          {rows.map((row) => <option key={row.epicId} value={row.epicId}>{row.area} › {row.epic}</option>)}
        </select></label>
      <label className="w-24"><span className="label">접두사</span>
        <input className="field font-mono uppercase" maxLength={10} pattern="[A-Za-z][A-Za-z0-9]*" placeholder="없음" value={form.prefix} onChange={(event) => setForm({ ...form, prefix: event.target.value })} /></label>
      <label className="w-24"><span className="label">시작 번호</span>
        <input type="number" inputMode="numeric" className="field" min={1} max={1000000} step={1} placeholder="그대로" disabled={!form.prefix.trim()} value={form.start} onChange={(event) => setForm({ ...form, start: event.target.value })} /></label>
      <button className="btn btn-primary h-8" disabled={!form.epicId}>저장</button>
    </form>
    {error && <p role="alert" className="alert mt-3">{error}</p>}
    {notice && <p role="status" className="mt-3 text-sm text-muted">{notice}</p>}
    {prefixed.length === 0 ? <p className="mt-3 text-sm text-faint">접두사가 정해진 에픽이 없습니다.</p>
      : <ul className="mt-3 divide-y divide-line rounded-md border border-line">{prefixed.map((row) => <li key={row.epicId} className="flex items-center gap-3 px-3 py-2 text-sm">
        <span className="badge font-mono">{row.keyPrefix}</span>
        <span className="min-w-0 flex-1 truncate font-medium">{row.area} › {row.epic}</span>
        <span className="text-xs tabular-nums text-faint">다음 {row.keyPrefix}-{row.nextNumber ?? 1}</span>
        <button type="button" className="btn btn-ghost h-7 px-2" onClick={() => edit(row)}>수정</button>
      </li>)}</ul>}
  </section>;
}
