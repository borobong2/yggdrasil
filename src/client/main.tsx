import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Activity, FileText, Inbox, ListTree, Settings, SquareKanban } from 'lucide-react';
import './styles.css';
import { LoginScreen, SessionPanel, TreeMark, useAuth } from './LoginView.js';
import { PatSettings } from './PatSettings.js';
import { DocumentsWorkspace } from './DocumentsWorkspace.js';
import { EvidenceList } from './EvidenceList.js';
import { PlanningView } from './PlanningView.js';
import { SearchCommand } from './SearchCommand.js';
import { BoardView } from './BoardView.js';
import { ActivityTimeline } from './ActivityTimeline.js';
import { InboxView } from './InboxView.js';

const tabs = [
  { id: 'inbox', label: '인박스', icon: Inbox },
  { id: 'documents', label: '문서', icon: FileText },
  { id: 'planning', label: '기획', icon: ListTree },
  { id: 'board', label: '보드', icon: SquareKanban },
  { id: 'activity', label: '활동', icon: Activity },
  { id: 'settings', label: '설정', icon: Settings },
] as const;
type Tab = typeof tabs[number]['id'];

// Hash routing: `#/board` selects a tab; record anchors (`#document-…`, `#issue-…`) jump to the owning tab.
function tabFromHash(current: Tab): Tab {
  const hash = location.hash.slice(1);
  const direct = tabs.find((tab) => hash === `/${tab.id}`);
  if (direct) return direct.id;
  if (hash.startsWith('document-')) return 'documents';
  if (/^(goal|epic|issue)-/.test(hash)) return 'planning';
  if (hash.startsWith('capture-')) return 'inbox';
  return current;
}

function App() {
  const auth = useAuth();
  const { token } = auth;
  const [tab, setTab] = useState<Tab>(() => tabFromHash('inbox'));
  const [activityRevision, setActivityRevision] = useState(0);
  const refreshActivity = () => setActivityRevision((revision) => revision + 1);

  useEffect(() => {
    const onHash = () => setTab(tabFromHash);
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  useEffect(() => { window.scrollTo(0, 0); }, [tab]);

  if (auth.config?.supabaseUrl && !auth.session) return <LoginScreen auth={auth} />;
  if (!auth.config && !auth.session) return <main className="grid min-h-dvh place-items-center text-sm text-muted">
    {auth.error ? <p role="alert" className="alert">{auth.error}</p> : <p role="status">불러오는 중…</p>}
  </main>;

  const active = tabs.find((item) => item.id === tab)!;
  return <div className="min-h-dvh md:grid md:grid-cols-[208px_minmax(0,1fr)]">
    <aside className="hidden border-r border-line bg-sunken/60 md:block">
      <div className="sticky top-0 flex h-dvh flex-col gap-1 p-3">
        <div className="mb-3 flex items-center gap-2 px-2 pt-1"><TreeMark className="size-6" /><span className="font-semibold tracking-tight">Yggdrasil</span></div>
        <Nav tab={tab} />
      </div>
    </aside>
    <div className="min-w-0 pb-20 md:pb-0">
      <header className="sticky top-0 z-20 flex h-12 items-center gap-3 border-b border-line bg-canvas/90 px-4 backdrop-blur md:px-6">
        <TreeMark className="size-6 md:hidden" />
        <h1 className="min-w-0 flex-1 truncate font-semibold">{active.label}</h1>
        <SearchCommand token={token} />
      </header>
      <main className="mx-auto w-full max-w-[1200px] px-4 py-5 md:px-6 md:py-6">
        {tab === 'inbox' && <InboxView token={token} onActivity={refreshActivity} />}
        {tab === 'documents' && <DocumentsWorkspace token={token} />}
        {tab === 'planning' && <PlanningView token={token} />}
        {tab === 'board' && <div className="space-y-6"><BoardView token={token} onActivity={refreshActivity} /><EvidenceList token={token} onActivity={refreshActivity} /></div>}
        {tab === 'activity' && <ActivityTimeline token={token} revision={activityRevision} />}
        {tab === 'settings' && <div className="max-w-2xl space-y-4"><SessionPanel auth={auth} /><PatSettings token={token} /></div>}
      </main>
    </div>
    <nav aria-label="주 메뉴 (모바일)" className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-6 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
      {tabs.map((item) => <a key={item.id} href={`#/${item.id}`} aria-current={item.id === tab ? 'page' : undefined}
        className="flex h-14 flex-col items-center justify-center gap-0.5 text-2xs font-medium text-faint aria-[current=page]:text-accent-ink">
        <item.icon className="size-5" strokeWidth={1.75} />{item.label}
      </a>)}
    </nav>
  </div>;
}

function Nav({ tab }: { tab: Tab }) {
  return <nav aria-label="주 메뉴" className="flex flex-col gap-0.5">
    {tabs.map((item) => <a key={item.id} href={`#/${item.id}`} aria-current={item.id === tab ? 'page' : undefined}
      className="flex h-8 items-center gap-2.5 rounded-md px-2 text-sm font-medium text-muted hover:bg-line/60 hover:text-ink aria-[current=page]:bg-surface aria-[current=page]:text-ink aria-[current=page]:shadow-card">
      <item.icon className="size-4" strokeWidth={1.75} />{item.label}
    </a>)}
  </nav>;
}

createRoot(document.getElementById('root')!).render(<App />);
