import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { DndContext, DragOverlay, KeyboardSensor, MouseSensor, TouchSensor, closestCorners, useDroppable, useSensor, useSensors, type Announcements, type DragEndEvent, type DragOverEvent, type UniqueIdentifier } from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Ellipsis, ListChecks, X } from 'lucide-react';
import type { Epic, Goal, Hold, Issue, IssueStatus, Priority } from '../contracts/items.js';
import { DueBadge, HoldBadge, PriorityBadge, statusLabels } from './format.js';
import { GitHubChips } from './GitHubChips.js';
import { TodoDetail } from './TodoDetail.js';
import { BulkActions, SelectBox, useSelection, type Selection } from './BulkActions.js';

// Backlog sits last so the first column on a phone is the work that matters now.
const statuses: IssueStatus[] = ['todo', 'doing', 'done', 'backlog'];
const dots: Record<IssueStatus, string> = { backlog: 'bg-line-strong', todo: 'bg-faint', doing: 'bg-info', done: 'bg-accent' };
const DONE_LIMIT = 5;
type Board = Record<IssueStatus, Issue[]>;
type Filters = { area: string; priority: '' | Priority; hold: '' | 'none' | Hold };
const noFilters: Filters = { area: '', priority: '', hold: '' };
const isStatus = (id: UniqueIdentifier): id is IssueStatus => statuses.includes(id as IssueStatus);

function toBoard(issues: Issue[]): Board {
  const sorted = [...issues].sort((a, b) => a.position - b.position || a.id.localeCompare(b.id));
  return Object.fromEntries(statuses.map((status) => [status, sorted.filter((issue) => issue.status === status)])) as Board;
}

export function BoardView({ token, onActivity }: { token: string; onActivity?: () => void }) {
  const [board, setBoard] = useState<Board | null>(null);
  const [areas, setAreas] = useState<Map<string, string>>(new Map()); // epicId → area (Goal title)
  const [loadError, setLoadError] = useState('');
  const [actionError, setActionError] = useState('');
  const [filters, setFilters] = useState<Filters>(noFilters);
  const [allDone, setAllDone] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const snapshot = useRef<Board | null>(null);
  const selection = useSelection();
  const headers: Record<string, string> = token ? { authorization: `Bearer ${token}` } : {};
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    // Long-press to pick up; moving before 250ms is a normal page/board scroll.
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
    // Space picks up so Enter stays free to open the detail panel.
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates, keyboardCodes: { start: ['Space'], cancel: ['Escape'], end: ['Space', 'Enter'] } })
  );

  useEffect(() => {
    let current = true;
    setBoard(null); setLoadError('');
    const get = async <T,>(url: string): Promise<T> => { const response = await fetch(url, { headers }); if (!response.ok) throw new Error(); return response.json(); };
    Promise.all([get<Issue[]>('/api/issues'), get<Goal[]>('/api/goals'), get<Epic[]>('/api/epics')]).then(([issues, goals, epics]) => {
      if (!current) return;
      const goalTitles = new Map(goals.map((goal) => [goal.id, goal.title]));
      setAreas(new Map(epics.map((epic) => [epic.id, goalTitles.get(epic.goalId) ?? ''])));
      setBoard(toBoard(issues));
    }).catch(() => { if (current) setLoadError('보드를 불러오지 못했습니다.'); });
    return () => { current = false; };
  }, [token]);

  if (loadError) return <p role="alert" className="alert">{loadError}</p>;
  if (!board) return <p role="status" className="empty">보드를 불러오는 중…</p>;

  const all = statuses.flatMap((status) => board[status]);
  const find = (id: UniqueIdentifier) => all.find((issue) => issue.id === id);
  const columnOf = (id: UniqueIdentifier, from = board) => isStatus(id) ? id : statuses.find((status) => from[status].some((issue) => issue.id === id));
  const passes = (issue: Issue) => issue.id === activeId || ((!filters.area || areas.get(issue.epicId) === filters.area)
    && (!filters.priority || issue.priority === filters.priority)
    && (!filters.hold || (filters.hold === 'none' ? !issue.hold : issue.hold === filters.hold)));
  const filtered = Object.fromEntries(statuses.map((status) => [status, board[status].filter(passes)])) as Board;
  const filtering = Boolean(filters.area || filters.priority || filters.hold);
  const where = (id: UniqueIdentifier) => {
    const status = columnOf(id);
    if (!status) return '';
    return isStatus(id) ? `${statusLabels[status]} 열` : `${statusLabels[status]} 열 ${board[status].findIndex((issue) => issue.id === id) + 1}번째`;
  };
  const announcements: Announcements = {
    onDragStart: ({ active }) => `${find(active.id)?.title} 카드를 들었습니다. ${where(active.id)}입니다.`,
    onDragOver: ({ active, over }) => !over ? `${find(active.id)?.title} 카드가 놓을 수 있는 영역 밖에 있습니다.` : over.id === active.id ? undefined : `${find(active.id)?.title} 카드: ${where(over.id)} 위치`,
    onDragEnd: ({ active, over }) => over ? `${find(active.id)?.title} 카드를 ${where(over.id)}에 놓았습니다.` : `${find(active.id)?.title} 카드를 놓지 않았습니다.`,
    onDragCancel: ({ active }) => `이동을 취소했습니다. ${find(active.id)?.title} 카드는 원래 자리에 있습니다.`
  };

  // ponytail: rollback restores the pre-move snapshot; overlapping failed moves can undo a later success until reload.
  async function persist(id: string, status: IssueStatus, position: number, previous: Board) {
    setActionError('');
    try {
      const response = await fetch(`/api/issues/${id}/move`, { method: 'PATCH', headers: { ...headers, 'content-type': 'application/json' }, body: JSON.stringify({ status, position }) });
      if (!response.ok) throw new Error();
      onActivity?.();
    } catch {
      setBoard(previous);
      setActionError('카드를 옮기지 못해 원래 자리로 되돌렸습니다. 다시 시도하세요.');
    }
  }

  function moveTo(issue: Issue, status: IssueStatus) {
    const previous = board!;
    const from = columnOf(issue.id)!;
    const next = { ...previous, [from]: previous[from].filter((item) => item.id !== issue.id) };
    next[status] = [{ ...issue, status }, ...next[status]];
    setBoard(next);
    void persist(issue.id, status, 0, previous);
  }

  function onDragOver({ active, over }: DragOverEvent) {
    if (!over) return;
    setBoard((prev) => {
      const from = columnOf(active.id, prev!); const to = columnOf(over.id, prev!);
      if (!prev || !from || !to || from === to) return prev;
      const item = prev[from].find((issue) => issue.id === active.id)!;
      const target = [...prev[to]];
      const index = target.findIndex((issue) => issue.id === over.id);
      target.splice(index < 0 ? target.length : index, 0, { ...item, status: to });
      return { ...prev, [from]: prev[from].filter((issue) => issue.id !== active.id), [to]: target };
    });
  }

  function onDragEnd({ active, over }: DragEndEvent) {
    const previous = snapshot.current!;
    snapshot.current = null; setActiveId(null);
    const to = columnOf(active.id);
    if (!over || !to) { setBoard(previous); return; }
    let column = board![to];
    const [oldIndex, newIndex] = [column.findIndex((issue) => issue.id === active.id), column.findIndex((issue) => issue.id === over.id)];
    if (newIndex >= 0 && oldIndex !== newIndex) column = arrayMove(column, oldIndex, newIndex);
    const position = column.findIndex((issue) => issue.id === active.id);
    const from = columnOf(active.id, previous)!;
    setBoard({ ...board!, [to]: column });
    if (from !== to || previous[from].findIndex((issue) => issue.id === active.id) !== position) void persist(String(active.id), to, position, previous);
  }

  function updated(todo: Issue) {
    setBoard((prev) => {
      if (!prev) return prev;
      const from = columnOf(todo.id, prev)!;
      const merged = { ...prev[from].find((issue) => issue.id === todo.id), ...todo };
      if (from === todo.status) return { ...prev, [from]: prev[from].map((issue) => issue.id === todo.id ? merged : issue) };
      return { ...prev, [from]: prev[from].filter((issue) => issue.id !== todo.id), [todo.status]: [merged, ...prev[todo.status]] };
    });
    onActivity?.();
  }

  const active = activeId ? find(activeId) : undefined;
  const order = statuses.flatMap((status) => filtered[status].map((issue) => issue.id));
  const selected = selectedId ? find(selectedId) : undefined;
  const areaNames = [...new Set(areas.values())].filter(Boolean).sort((a, b) => a.localeCompare(b, 'ko'));

  return <section aria-label="실행 보드" className="space-y-3">
    <div role="group" aria-label="보드 필터" className="flex flex-wrap items-center gap-2">
      <select aria-label="영역 필터" className="field h-8 w-auto max-w-[44%] sm:max-w-48" value={filters.area} onChange={(event) => setFilters({ ...filters, area: event.target.value })}>
        <option value="">모든 영역</option>{areaNames.map((name) => <option key={name} value={name}>{name}</option>)}
      </select>
      <select aria-label="우선순위 필터" className="field h-8 w-auto" value={filters.priority} onChange={(event) => setFilters({ ...filters, priority: event.target.value as Filters['priority'] })}>
        <option value="">모든 우선순위</option>{(['p1', 'p2', 'p3', 'p4'] as const).map((value) => <option key={value} value={value}>{value.toUpperCase()}</option>)}
      </select>
      <select aria-label="보류 필터" className="field h-8 w-auto" value={filters.hold} onChange={(event) => setFilters({ ...filters, hold: event.target.value as Filters['hold'] })}>
        <option value="">보류 전체</option><option value="none">보류 없음</option><option value="waiting">대기</option><option value="blocked">막힘</option><option value="scheduled">예정</option>
      </select>
      {filtering && <button type="button" className="btn btn-ghost h-8" onClick={() => setFilters(noFilters)}><X />필터 해제</button>}
      <button type="button" className="btn btn-ghost ml-auto h-8" aria-pressed={selection.mode} onClick={() => selection.mode ? selection.clear() : selection.setMode(true)}><ListChecks />{selection.mode ? '선택 끝내기' : '선택'}</button>
    </div>
    {actionError && <p role="alert" className="alert flex items-center gap-2"><span className="flex-1">{actionError}</span>
      <button type="button" className="btn btn-ghost size-6 p-0 text-danger" aria-label="오류 닫기" onClick={() => setActionError('')}><X /></button></p>}
    {all.length === 0 ? <p className="card empty">백로그나 보드에 이슈가 없습니다.</p> :
      <DndContext sensors={sensors} collisionDetection={closestCorners} accessibility={{ announcements, screenReaderInstructions: { draggable: '스페이스를 누르면 카드를 듭니다. 방향키로 옮기고 스페이스로 놓으며, Esc로 취소합니다. Enter는 상세를 엽니다.' } }}
        onDragStart={({ active }) => { snapshot.current = board; setActiveId(String(active.id)); setActionError(''); }}
        onDragOver={onDragOver} onDragEnd={onDragEnd}
        onDragCancel={() => { if (snapshot.current) setBoard(snapshot.current); snapshot.current = null; setActiveId(null); }}>
        {/* Columns scroll sideways inside the board on narrow screens so cross-column drags never need page scrolling. */}
        <div aria-label="Board columns" className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 md:mx-0 md:px-0 lg:grid lg:snap-none lg:grid-cols-4 lg:overflow-visible">
          {statuses.map((status) => {
            const list = filtered[status];
            const limited = status === 'done' && !allDone && list.length > DONE_LIMIT;
            const shown = limited ? list.filter((issue, index) => index < DONE_LIMIT || issue.id === activeId) : list;
            return <BoardColumn key={status} status={status} issues={shown} count={list.length} total={board[status].length} onOpen={setSelectedId} onMove={moveTo} selection={selection} order={order}
              footer={status === 'done' && list.length > DONE_LIMIT ? <button type="button" className="btn btn-ghost mt-1 h-7 w-full text-xs" aria-expanded={allDone} onClick={() => setAllDone(!allDone)}>
                {allDone ? '최근 것만 보기' : `더보기 (${list.length - DONE_LIMIT}개)`}</button> : null} />;
          })}
        </div>
        <DragOverlay dropAnimation={null}>{active ? <div className="card cursor-grabbing p-3 shadow-pop"><CardBody issue={active} /></div> : null}</DragOverlay>
      </DndContext>}
    <BulkActions selection={selection} headers={headers} onApplied={(todos) => todos.forEach(updated)} />
    {selected && <TodoDetail key={selected.id} issue={selected} area={areas.get(selected.epicId) ?? ''} headers={headers} onClose={() => setSelectedId(null)} onSaved={updated} />}
  </section>;
}

type SelectProps = { selection: Selection; order: string[] };
function BoardColumn({ status, issues, count, total, onOpen, onMove, footer, selection, order }: { status: IssueStatus; issues: Issue[]; count: number; total: number; onOpen: (id: string) => void; onMove: (issue: Issue, status: IssueStatus) => void; footer: React.ReactNode } & SelectProps) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  const title = statusLabels[status];
  return <section aria-label={title} ref={setNodeRef} data-status={status}
    className={`w-[82%] max-w-80 shrink-0 snap-start rounded-lg p-2 transition-colors sm:w-64 lg:w-auto lg:max-w-none ${isOver ? 'bg-accent-soft' : status === 'backlog' ? 'bg-sunken/45' : 'bg-sunken/70'}`}>
    <h3 className="flex items-center gap-2 px-1 pb-2 text-sm font-semibold"><span className={`size-2 rounded-full ${dots[status]}`} />{title}
      <span className="font-normal tabular-nums text-faint">{count === total ? total : `${count}/${total}`}</span></h3>
    <SortableContext id={status} items={issues.map((issue) => issue.id)} strategy={verticalListSortingStrategy}>
      <ul className="min-h-16 space-y-2">
        {issues.map((issue) => <SortableCard key={issue.id} issue={issue} onOpen={onOpen} onMove={onMove} selection={selection} order={order} />)}
        {issues.length === 0 && <li className="rounded-md border border-dashed border-line-strong py-6 text-center text-xs text-faint">{total ? '조건에 맞는 이슈 없음' : '여기로 끌어 놓기'}</li>}
      </ul>
    </SortableContext>
    {footer}
  </section>;
}

function SortableCard({ issue, onOpen, onMove, selection, order }: { issue: Issue; onOpen: (id: string) => void; onMove: (issue: Issue, status: IssueStatus) => void } & SelectProps) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: issue.id });
  const style: CSSProperties = { transform: CSS.Translate.toString(transform), transition };
  const checked = selection.selected.has(issue.id);
  return <li ref={setNodeRef} style={style} data-issue-id={issue.id} className={`card group relative select-none [-webkit-touch-callout:none] ${isDragging ? 'opacity-40 ring-2 ring-accent' : checked ? 'border-accent bg-accent-soft' : 'hover:border-line-strong'}`}>
    <SelectBox label={issue.title} checked={checked} onToggle={(range) => selection.toggle(issue.id, range, order)} className={`absolute left-3 top-[15px] z-[1] ${selection.mode ? '' : 'hidden md:block'}`} />
    <button type="button" ref={setActivatorNodeRef} {...attributes} {...listeners} aria-roledescription="이동 가능한 카드" onClick={(event) => selection.mode ? selection.toggle(issue.id, event.shiftKey, order) : onOpen(issue.id)}
      className={`block w-full cursor-grab touch-manipulation rounded-[inherit] p-3 pr-9 text-left active:cursor-grabbing ${selection.mode ? 'pl-9' : 'md:pl-9'}`}>
      <CardBody issue={issue} />
    </button>
    {(issue.key || issue.github?.pr || issue.github?.deploy) && <div className={`-mt-1.5 flex flex-wrap gap-1 px-3 pb-3 ${selection.mode ? 'pl-9' : 'md:pl-9'}`}><GitHubChips issue={issue} /></div>}
    <CardMenu issue={issue} onMove={onMove} />
  </li>;
}

function CardBody({ issue }: { issue: Issue }) {
  return <>
    <strong className={`block break-words text-sm font-medium ${issue.status === 'done' ? 'text-muted line-through' : ''}`}>{issue.title}</strong>
    <span className="mt-2 flex flex-wrap items-center gap-1">
      <PriorityBadge priority={issue.priority} />
      {issue.hold && <HoldBadge hold={issue.hold} reason={issue.holdReason} />}
      <DueBadge issue={issue} />
    </span>
  </>;
}

// Accessible fallback for moving without dragging.
function CardMenu({ issue, onMove }: { issue: Issue; onMove: (issue: Issue, status: IssueStatus) => void }) {
  const [open, setOpen] = useState(false);
  return <div className="absolute right-1.5 top-1.5" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}
    onKeyDown={(event) => { if (event.key === 'Escape') { setOpen(false); (event.currentTarget.firstElementChild as HTMLElement).focus(); } }}>
    <button type="button" className="btn btn-ghost size-7 p-0" aria-label={`${issue.title} 메뉴`} aria-expanded={open} onClick={() => setOpen(!open)}><Ellipsis /></button>
    {open && <div className="card absolute right-0 top-8 z-10 w-36 p-1 shadow-pop" role="group" aria-label="상태 이동">
      <p className="eyebrow px-2 py-1">상태 이동</p>
      {statuses.filter((status) => status !== issue.status).map((status) => <button key={status} type="button" className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-sm hover:bg-sunken focus-visible:bg-sunken"
        onClick={() => { setOpen(false); onMove(issue, status); }}><span className={`size-2 rounded-full ${dots[status]}`} />{statusLabels[status]}</button>)}
    </div>}
  </div>;
}
