import { useMemo, useState } from 'react';
import { BookOpen, Code2 } from 'lucide-react';
import { buildHtmlPreview } from './html-document.js';

type Props = { body: string; onChange: (body: string) => void };

export function HtmlDocument({ body, onChange }: Props) {
  const [editing, setEditing] = useState(false);
  const preview = useMemo(() => buildHtmlPreview(body), [body]);
  return <section aria-label="HTML 문서" className="min-w-0">
    <div className="mb-3 flex flex-wrap items-center gap-1 border-b border-line pb-3">
      <button type="button" aria-pressed={!editing} onClick={() => setEditing(false)} className={`btn min-h-11 ${!editing ? 'btn-primary' : 'btn-ghost'}`}><BookOpen />읽기</button>
      <button type="button" aria-pressed={editing} aria-label="HTML 소스 편집" onClick={() => setEditing(true)} className={`btn min-h-11 ${editing ? 'btn-primary' : 'btn-ghost'}`}><Code2 />소스 편집</button>
      <span className="ml-auto text-xs text-muted">HTML 문서</span>
    </div>
    {editing ? <div>
      <p id="html-source-help" className="mb-3 text-sm text-muted">HTML과 CSS를 편집하면 자동 저장됩니다. ‘읽기’에서 결과를 확인하세요. 스크립트와 외부 콘텐츠는 표시하지 않습니다.</p>
      <textarea aria-label="HTML 소스" aria-describedby="html-source-help" value={body} maxLength={100_000} spellCheck={false}
        onChange={event => onChange(event.target.value)}
        className="field min-h-[65dvh] w-full resize-y whitespace-pre-wrap break-all font-mono text-sm leading-6" />
    </div> : body.trim() ? <iframe title="HTML 문서 읽기" sandbox="" srcDoc={preview}
      className="block h-[75dvh] min-h-96 w-full rounded-md border border-line bg-surface" />
      : <div className="empty py-16"><p>아직 내용이 없습니다.</p><button type="button" className="btn mt-3 min-h-11" onClick={() => setEditing(true)}>HTML 작성하기</button></div>}
  </section>;
}
