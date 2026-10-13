import { useEffect, useState } from 'react';
import { Check, Copy, FileText, Folder, GitPullRequest, Link2 } from 'lucide-react';
import type { Document, Issue, IssueLink } from '../contracts/items.js';

const icons = { doc: FileText, web: Link2, local: Folder, pr: GitPullRequest };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const chip = 'badge max-w-40 hover:underline';

/** YG-42 todo links. web/pr/external doc open in a new tab, a document id opens the 문서 tab, a local path copies. `max` collapses the rest into '+n'. */
export function LinkChips({ links, max }: { links: IssueLink[]; max?: number }) {
  const shown = max === undefined ? links : links.slice(0, max);
  return <>
    {shown.map((link, index) => <LinkChip key={`${index}-${link.label}`} link={link} />)}
    {links.length > shown.length && <span className="badge" title={links.slice(shown.length).map((link) => link.label).join(', ')}>+{links.length - shown.length}</span>}
  </>;
}

function LinkChip({ link }: { link: IssueLink }) {
  const [copied, setCopied] = useState(false);
  const Icon = icons[link.kind];
  const label = <><Icon className="shrink-0" /><span className="truncate">{link.label}</span></>;
  if (link.kind === 'local' || !link.url && !uuid.test(link.path ?? '')) {
    return <button type="button" className={chip} title={`${link.path} 복사`} aria-label={`${link.label} 경로 복사: ${link.path}`}
      onClick={() => void navigator.clipboard?.writeText(link.path ?? '').then(() => { setCopied(true); setTimeout(() => setCopied(false), 1200); })}>
      {label}{copied ? <Check className="shrink-0 text-accent" /> : <Copy className="shrink-0" />}
    </button>;
  }
  return link.url
    ? <a href={link.url} target="_blank" rel="noreferrer" className={chip} title={link.url}>{label}</a>
    : <a href={`#document-${link.path}`} className={chip} title="문서 열기">{label}</a>;
}

/** TodoDetail section: the todo's links (YG-42) and its linked documents (YG-33). */
export function TodoLinks({ issue, headers }: { issue: Pick<Issue, 'id' | 'links'>; headers: Record<string, string> }) {
  return <>
    {issue.links.length > 0 && <div><span className="label">링크</span><div className="flex flex-wrap gap-1"><LinkChips links={issue.links} /></div></div>}
    <LinkedDocs issueId={issue.id} headers={headers} />
  </>;
}

/** YG-33: documents linked to a todo, as chips that open the page in the 문서 tab. */
function LinkedDocs({ issueId, headers }: { issueId: string; headers: Record<string, string> }) {
  const [docs, setDocs] = useState<Document[]>([]);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/documents?issueId=${issueId}`, { headers, signal: controller.signal }).then((response) => response.ok ? response.json() : []).then(setDocs, () => {});
    return () => controller.abort();
  }, [issueId]); // headers is rebuilt every render; the token doesn't change while the detail is open
  if (!docs.length) return null;
  return <div><span className="label">연결 문서</span><div className="flex flex-wrap gap-1">
    {docs.map((doc) => <a key={doc.id} href={`#document-${doc.id}`} className={chip} title={doc.title}>{doc.icon ? <span>{doc.icon}</span> : <FileText className="shrink-0" />}<span className="truncate">{doc.title}</span></a>)}
  </div></div>;
}
