import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ChangeEvent, ClipboardEvent, DragEvent, KeyboardEvent, ReactNode } from 'react';
import { ChevronRight, GripVertical, Plus } from 'lucide-react';
import type { Issue } from '../contracts/items.js';
import { block, mentionToken, parseMarkdown, serializeMarkdown } from './blocks.js';
import type { Block, BlockType } from './blocks.js';
import { statusLabels } from './format.js';

// One auto-growing <textarea> per block: native IME (Korean) and plain-text paste for free, and the block list
// maps 1:1 to markdown. Unfocused blocks render inline markdown (bold, code, links, @mention chips).
type Command = { type: BlockType | 'mention'; label: string; hint: string; keys: string[] };
const commands: Command[] = [
  { type: 'p', label: '텍스트', hint: '일반 문단', keys: ['text', 'paragraph', '텍스트', '문단'] },
  { type: 'h1', label: '제목 1', hint: '# 큰 제목', keys: ['h1', 'heading', '제목'] },
  { type: 'h2', label: '제목 2', hint: '## 중간 제목', keys: ['h2', 'heading', '제목'] },
  { type: 'h3', label: '제목 3', hint: '### 작은 제목', keys: ['h3', 'heading', '제목'] },
  { type: 'bullet', label: '글머리 기호 목록', hint: '- 목록', keys: ['bullet', 'list', '글머리', '목록'] },
  { type: 'numbered', label: '번호 목록', hint: '1. 목록', keys: ['numbered', 'ol', '번호', '목록'] },
  { type: 'todo', label: '체크리스트', hint: '[] 할 일', keys: ['todo', 'check', '체크', '할일'] },
  { type: 'quote', label: '인용', hint: '> 인용문', keys: ['quote', '인용'] },
  { type: 'code', label: '코드', hint: '``` 코드 블록', keys: ['code', '코드'] },
  { type: 'divider', label: '구분선', hint: '--- 가로선', keys: ['divider', 'hr', '구분'] },
  { type: 'callout', label: '콜아웃', hint: '강조 상자', keys: ['callout', 'note', '콜아웃', '강조'] },
  { type: 'toggle', label: '토글', hint: '접고 펼치는 목록', keys: ['toggle', 'details', '토글', '접기'] },
  { type: 'mention', label: '할 일 언급', hint: '@ 할 일 연결', keys: ['mention', 'issue', 'todo', '할 일', '언급', '이슈'] },
];
const shortcuts: Record<string, [BlockType, Partial<Block>?]> = {
  '# ': ['h1'], '## ': ['h2'], '### ': ['h3'], '- ': ['bullet'], '* ': ['bullet'], '1. ': ['numbered'],
  '[] ': ['todo', { checked: false }], '[ ] ': ['todo', { checked: false }], '> ': ['quote'], '```': ['code'], '---': ['divider'],
};
const listTypes: BlockType[] = ['bullet', 'numbered', 'todo'];
const placeholders: Partial<Record<BlockType, string>> = { h1: '제목 1', h2: '제목 2', h3: '제목 3', bullet: '목록', numbered: '목록', todo: '할 일', quote: '인용', code: '코드', callout: '내용을 입력하세요', toggle: '토글 제목 · Shift+Enter로 내용' };
const typography: Record<BlockType, string> = {
  p: 'text-[15px] leading-7', h1: 'text-[26px] leading-9 font-bold tracking-tight', h2: 'text-[21px] leading-8 font-semibold tracking-tight', h3: 'text-[17px] leading-7 font-semibold',
  bullet: 'text-[15px] leading-7', numbered: 'text-[15px] leading-7', todo: 'text-[15px] leading-7', quote: 'text-[15px] leading-7', callout: 'text-[15px] leading-7',
  code: 'font-mono text-[13px] leading-6', toggle: 'text-[15px] leading-7', divider: '',
};
const spacing: Partial<Record<BlockType, string>> = { h1: 'mt-6', h2: 'mt-5', h3: 'mt-3', code: 'my-1', callout: 'my-1', quote: 'my-0.5' };

type Menu = { kind: 'slash' | 'mention'; blockId: string; start: number; query: string; index: number };
type Props = { initial: string; issues: Issue[]; onChange: (markdown: string) => void; onMention: (issueId: string) => void };

export function BlockEditor({ initial, issues, onChange, onMention }: Props) {
  const [blocks, setBlocks] = useState<Block[]>(() => { const parsed = parseMarkdown(initial); return parsed.length ? parsed : [block()]; });
  const [active, setActive] = useState<string | null>(null);
  const [menu, setMenu] = useState<Menu | null>(null);
  const [actions, setActions] = useState<string | null>(null);
  const [drag, setDrag] = useState<{ id: string; over?: string; after?: boolean } | null>(null);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const refs = useRef(new Map<string, HTMLTextAreaElement>());
  const pendingFocus = useRef<{ id: string; caret: number } | null>(null);
  const mounted = useRef(false);

  useEffect(() => { if (mounted.current) onChange(serializeMarkdown(blocks)); mounted.current = true; }, [blocks]);
  useLayoutEffect(() => {
    const target = pendingFocus.current;
    const element = target && refs.current.get(target.id);
    if (!target || !element) return;
    pendingFocus.current = null;
    element.focus();
    element.setSelectionRange(target.caret, target.caret);
  });

  const focus = (id: string, caret: number) => { pendingFocus.current = { id, caret }; setActive(id); };
  const patch = (id: string, changes: Partial<Block>) => setBlocks((all) => all.map((b) => b.id === id ? { ...b, ...changes } : b));
  const splice = (id: string, replacement: Block[]) => setBlocks((all) => { const i = all.findIndex((b) => b.id === id); return [...all.slice(0, i), ...replacement, ...all.slice(i + 1)]; });
  const move = (id: string, targetId: string, after: boolean) => setBlocks((all) => {
    if (id === targetId) return all;
    const moving = all.find((b) => b.id === id)!;
    const rest = all.filter((b) => b.id !== id);
    const i = rest.findIndex((b) => b.id === targetId) + (after ? 1 : 0);
    return [...rest.slice(0, i), moving, ...rest.slice(i)];
  });
  const neighbor = (id: string, step: 1 | -1) => { const i = blocks.findIndex((b) => b.id === id); for (let j = i + step; j >= 0 && j < blocks.length; j += step) if (blocks[j]!.type !== 'divider') return blocks[j]; return undefined; };

  const menuItems = (current: Menu) => {
    const q = current.query.toLowerCase();
    const bare = (value: string) => value.toLowerCase().replace(/\s/g, '');
    if (current.kind === 'slash') return commands.filter((c) => !q || bare(c.label).includes(bare(q)) || c.keys.some((key) => key.startsWith(q)));
    return issues.filter((issue) => !q || issue.title.toLowerCase().includes(q)).slice(0, 8);
  };

  function change(b: Block, event: ChangeEvent<HTMLTextAreaElement>) {
    const text = event.target.value;
    const caret = event.target.selectionStart;
    const before = text.slice(0, caret);
    const shortcut = (b.type === 'p' || b.type === 'bullet' && /^\[ ?\] $/.test(before)) ? shortcuts[before] : undefined;
    if (shortcut) {
      const [type, extra] = shortcut;
      setMenu(null);
      if (type === 'divider') { const next = block('p', text.slice(caret)); splice(b.id, [block('divider'), next]); return focus(next.id, 0); }
      patch(b.id, { type, text: text.slice(caret), ...extra });
      return focus(b.id, 0);
    }
    patch(b.id, { text });
    const slash = b.type !== 'code' && before.match(/(?:^|\s)\/([^\s/]{0,20})$/);
    const at = b.type !== 'code' && before.match(/(?:^|\s)@([^\s@]{0,30})$/);
    if (slash) setMenu((current) => ({ kind: 'slash', blockId: b.id, start: caret - slash[1]!.length - 1, query: slash[1]!, index: current?.query === slash[1] ? current.index : 0 }));
    else if (at) setMenu({ kind: 'mention', blockId: b.id, start: caret - at[1]!.length - 1, query: at[1]!, index: 0 });
    else setMenu(null);
  }

  function choose(current: Menu, item: Command | Issue) {
    const b = blocks.find((candidate) => candidate.id === current.blockId)!;
    const caret = refs.current.get(b.id)?.selectionStart ?? b.text.length;
    const head = b.text.slice(0, current.start);
    const tail = b.text.slice(caret);
    setMenu(null);
    if ('status' in item) {
      const token = `${mentionToken(item.title, item.id)} `;
      patch(b.id, { text: head + token + tail });
      onMention(item.id);
      return focus(b.id, head.length + token.length);
    }
    if (item.type === 'mention') { patch(b.id, { text: `${head}@${tail}` }); setMenu({ kind: 'mention', blockId: b.id, start: head.length, query: '', index: 0 }); return focus(b.id, head.length + 1); }
    if (item.type === 'divider') {
      const next = block('p', tail);
      splice(b.id, head.trim() ? [{ ...b, text: head }, block('divider'), next] : [block('divider'), next]);
      return focus(next.id, 0);
    }
    patch(b.id, { type: item.type, text: head + tail, checked: item.type === 'todo' ? false : undefined });
    focus(b.id, head.length);
  }

  function keyDown(b: Block, event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.nativeEvent.isComposing || event.keyCode === 229) return; // let the IME finish (Korean input)
    const { selectionStart: caret, selectionEnd: end } = event.currentTarget;
    const text = b.text;
    if (menu?.blockId === b.id) {
      const items = menuItems(menu);
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); const step = event.key === 'ArrowDown' ? 1 : -1; return setMenu({ ...menu, index: (menu.index + step + Math.max(items.length, 1)) % Math.max(items.length, 1) }); }
      if ((event.key === 'Enter' || event.key === 'Tab') && items[menu.index]) { event.preventDefault(); return choose(menu, items[menu.index]!); }
      if (event.key === 'Escape') { event.preventDefault(); return setMenu(null); }
    }
    if (event.altKey && event.shiftKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
      event.preventDefault();
      const i = blocks.findIndex((x) => x.id === b.id);
      const target = blocks[i + (event.key === 'ArrowUp' ? -1 : 1)];
      if (target) { move(b.id, target.id, event.key === 'ArrowDown'); focus(b.id, caret); }
      return;
    }
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) { event.preventDefault(); const next = block(); splice(b.id, [b, next]); return focus(next.id, 0); }
    if (event.key === 'Enter' && !event.shiftKey && b.type !== 'code') {
      event.preventDefault();
      if (listTypes.includes(b.type) && !text) return patch(b.id, { type: 'p' }); // Enter on an empty item leaves the list
      const next = block(listTypes.includes(b.type) ? b.type : 'p', text.slice(end), b.type === 'todo' ? { checked: false } : {});
      splice(b.id, [{ ...b, text: text.slice(0, caret) }, next]);
      return focus(next.id, 0);
    }
    if (event.key === 'Backspace' && caret === 0 && end === 0) {
      if (b.type !== 'p') { event.preventDefault(); return patch(b.id, { type: 'p', checked: undefined }); }
      const i = blocks.findIndex((x) => x.id === b.id);
      const previous = blocks[i - 1];
      if (!previous) return;
      event.preventDefault();
      if (previous.type === 'divider') return setBlocks((all) => all.filter((x) => x.id !== previous.id));
      setBlocks((all) => all.filter((x) => x.id !== b.id).map((x) => x.id === previous.id ? { ...x, text: x.text + text } : x));
      return focus(previous.id, previous.text.length);
    }
    if (event.key === 'ArrowUp' && caret === end && !text.slice(0, caret).includes('\n')) {
      const previous = neighbor(b.id, -1);
      if (previous) { event.preventDefault(); focus(previous.id, previous.text.length); }
    }
    if (event.key === 'ArrowDown' && caret === end && !text.slice(caret).includes('\n')) {
      const next = neighbor(b.id, 1);
      if (next) { event.preventDefault(); focus(next.id, 0); } else if (b.type === 'code') { event.preventDefault(); const fresh = block(); splice(b.id, [b, fresh]); focus(fresh.id, 0); }
    }
  }

  // Multi-line plain text becomes blocks; formatting from rich sources is dropped because only text/plain is read.
  function paste(b: Block, event: ClipboardEvent<HTMLTextAreaElement>) {
    const text = event.clipboardData.getData('text/plain');
    if (b.type === 'code' || !text.includes('\n')) return;
    const parsed = parseMarkdown(text);
    if (!parsed.length) return;
    event.preventDefault();
    const { selectionStart, selectionEnd } = event.currentTarget;
    const head = b.text.slice(0, selectionStart);
    const tail = b.text.slice(selectionEnd);
    const after = block('p', tail);
    splice(b.id, [...(head ? [{ ...b, text: head }] : []), ...parsed, after]);
    focus(after.id, 0);
  }

  function dragOver(b: Block, event: DragEvent<HTMLDivElement>) {
    if (!drag) return;
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    const after = event.clientY > rect.top + rect.height / 2;
    if (drag.over !== b.id || drag.after !== after) setDrag({ ...drag, over: b.id, after });
  }

  let number = 0;
  return <div className="relative pb-24" onClick={(event) => {
    if (event.target !== event.currentTarget) return;
    const last = blocks[blocks.length - 1]!;
    if (last.type === 'p' && !last.text) return focus(last.id, 0);
    const fresh = block(); setBlocks((all) => [...all, fresh]); focus(fresh.id, 0);
  }}>
    {blocks.map((b, i) => {
      number = b.type === 'numbered' ? (blocks[i - 1]?.type === 'numbered' ? number + 1 : 1) : 0;
      const editing = active === b.id;
      const hint = blocks.length === 1 && !b.text && b.type === 'p' ? "내용을 입력하거나 '/'로 블록을, '@'로 할 일을 추가하세요" : editing ? (placeholders[b.type] ?? "'/' 입력으로 명령 사용") : placeholders[b.type];
      const indicator = drag?.over === b.id && drag.id !== b.id ? (drag.after ? 'shadow-[0_2px_0_var(--color-accent)]' : 'shadow-[0_-2px_0_var(--color-accent)]') : '';
      return <div key={b.id} data-row={b.id} data-type={b.type} className={`group relative flex items-start rounded-sm ${spacing[b.type] ?? ''} ${indicator} ${drag?.id === b.id ? 'opacity-40' : ''}`}
        onDragOver={(event) => dragOver(b, event)} onDrop={(event) => { event.preventDefault(); if (drag?.over) move(drag.id, drag.over, !!drag.after); setDrag(null); }}>
        <div className="absolute -left-12 top-0 hidden h-7 items-center opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100 md:flex">
          <button type="button" tabIndex={-1} aria-label="아래에 블록 추가" className="grid size-6 place-items-center rounded text-faint hover:bg-sunken hover:text-ink"
            onClick={() => { const fresh = block('p', '/'); splice(b.id, [b, fresh]); focus(fresh.id, 1); setMenu({ kind: 'slash', blockId: fresh.id, start: 0, query: '', index: 0 }); }}><Plus className="size-4" /></button>
          <button type="button" draggable aria-label="블록 이동 (끌기) · 메뉴" className="grid size-6 cursor-grab place-items-center rounded text-faint hover:bg-sunken hover:text-ink"
            onDragStart={(event) => { event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('application/x-yggdrasil-block', b.id); const row = event.currentTarget.closest('[data-row]'); if (row) event.dataTransfer.setDragImage(row, 0, 0); setDrag({ id: b.id }); }}
            onDragEnd={() => setDrag(null)} onClick={() => setActions(actions === b.id ? null : b.id)}><GripVertical className="size-4" /></button>
        </div>
        {actions === b.id && <div role="menu" className="absolute -left-12 top-7 z-30 w-36 rounded-md border border-line bg-surface p-1 shadow-pop">
          {[['위로 이동', () => blocks[i - 1] && move(b.id, blocks[i - 1]!.id, false)], ['아래로 이동', () => blocks[i + 1] && move(b.id, blocks[i + 1]!.id, true)],
            ['삭제', () => setBlocks((all) => all.length > 1 ? all.filter((x) => x.id !== b.id) : [block()])]].map(([label, run]) =>
            <button key={label as string} role="menuitem" type="button" className="block w-full rounded px-2 py-1 text-left text-sm hover:bg-sunken" onClick={() => { (run as () => void)(); setActions(null); }}>{label as string}</button>)}
        </div>}
        {b.type === 'divider' ? <div role="separator" className="w-full py-3"><hr className="border-line-strong" /></div> : <>
          {b.type === 'bullet' && <span aria-hidden className="w-6 shrink-0 select-none text-center leading-7">•</span>}
          {b.type === 'numbered' && <span aria-hidden className="w-6 shrink-0 select-none pr-1 text-right leading-7 tabular-nums">{number}.</span>}
          {b.type === 'todo' && <span className="flex h-7 w-6 shrink-0 items-center"><input type="checkbox" aria-label="완료" checked={!!b.checked} onChange={() => patch(b.id, { checked: !b.checked })} className="size-4 accent-[var(--color-accent)]" /></span>}
          {b.type === 'toggle' && <button type="button" aria-label={open.has(b.id) ? '토글 접기' : '토글 펼치기'} aria-expanded={open.has(b.id)} className="grid h-7 w-6 shrink-0 place-items-center text-muted"
            onClick={() => setOpen((current) => { const next = new Set(current); if (!next.delete(b.id)) next.add(b.id); return next; })}><ChevronRight className={`size-4 transition-transform ${open.has(b.id) ? 'rotate-90' : ''}`} /></button>}
          {b.type === 'callout' && <span aria-hidden className="w-9 shrink-0 select-none self-stretch rounded-l-md bg-sunken pt-3 pl-3 leading-7">💡</span>}
          <div className={`min-w-0 flex-1 ${b.type === 'quote' ? 'border-l-[3px] border-ink/70 pl-3' : ''} ${b.type === 'callout' ? 'rounded-r-md bg-sunken py-3 pr-3 pl-2' : ''} ${b.type === 'code' ? 'rounded-md bg-sunken px-4 py-3' : ''} ${b.type === 'todo' && b.checked ? 'text-faint line-through' : ''}`}>
            {editing || !b.text
              ? <AutoTextarea b={b} hint={hint} refs={refs} className={typography[b.type]}
                onFocus={() => setActive(b.id)} onBlur={() => { setActive((current) => current === b.id ? null : current); setMenu((current) => current?.blockId === b.id ? null : current); }}
                onChange={(event) => change(b, event)} onKeyDown={(event) => keyDown(b, event)} onPaste={(event) => paste(b, event)} />
              : <div className={`cursor-text whitespace-pre-wrap break-words ${typography[b.type]}`} onClick={(event) => { if (!(event.target as HTMLElement).closest('a')) focus(b.id, b.text.length); }}>
                {b.type === 'toggle' ? <><Inline text={b.text.split('\n')[0]!} />{open.has(b.id) && b.text.includes('\n') && <div className="text-muted"><Inline text={b.text.slice(b.text.indexOf('\n') + 1)} /></div>}</>
                  : b.type === 'code' ? b.text : <Inline text={b.text} />}
              </div>}
          </div>
        </>}
        {menu?.blockId === b.id && <CommandMenu menu={menu} items={menuItems(menu)} choose={(item) => choose(menu, item)} hover={(index) => setMenu({ ...menu, index })} />}
      </div>;
    })}
  </div>;
}

function AutoTextarea({ b, hint, refs, className, ...handlers }: { b: Block; hint?: string; refs: React.RefObject<Map<string, HTMLTextAreaElement>>; className: string } & Pick<React.TextareaHTMLAttributes<HTMLTextAreaElement>, 'onFocus' | 'onBlur' | 'onChange' | 'onKeyDown' | 'onPaste'>) {
  const element = useRef<HTMLTextAreaElement | null>(null);
  useLayoutEffect(() => { const el = element.current; if (el) { el.style.height = '0px'; el.style.height = `${el.scrollHeight}px`; } });
  return <textarea ref={(el) => { element.current = el; if (el) refs.current.set(b.id, el); else refs.current.delete(b.id); }} rows={1} value={b.text} placeholder={hint} aria-label={`${b.type} 블록`} data-block={b.type}
    spellCheck={b.type !== 'code'} className={`block w-full resize-none overflow-hidden bg-transparent outline-none placeholder:text-faint/80 ${className}`} {...handlers} />;
}

function CommandMenu({ menu, items, choose, hover }: { menu: Menu; items: (Command | Issue)[]; choose: (item: Command | Issue) => void; hover: (index: number) => void }) {
  return <div role="listbox" aria-label={menu.kind === 'slash' ? '블록 명령' : '할 일 언급'} className="absolute left-0 top-full z-30 mt-1 max-h-72 w-72 max-w-[calc(100vw-2rem)] overflow-y-auto rounded-lg border border-line bg-surface p-1 shadow-pop"
    onMouseDown={(event) => event.preventDefault() /* keep textarea focus */}>
    <p className="px-2 pb-1 pt-1.5 text-2xs font-semibold text-faint">{menu.kind === 'slash' ? '블록' : '할 일 언급'}</p>
    {!items.length && <p className="px-2 py-2 text-sm text-faint">{menu.kind === 'slash' ? '일치하는 블록이 없습니다' : '일치하는 할 일이 없습니다'}</p>}
    {items.map((item, index) => <button key={'status' in item ? item.id : item.type} type="button" role="option" aria-selected={index === menu.index}
      className="flex w-full items-center justify-between gap-3 rounded-md px-2 py-1.5 text-left text-sm aria-selected:bg-sunken" onMouseEnter={() => hover(index)} onClick={() => choose(item)}>
      <span className="min-w-0 truncate">{'status' in item ? item.title : item.label}</span>
      <span className="shrink-0 text-2xs text-faint">{'status' in item ? statusLabels[item.status] : item.hint}</span>
    </button>)}
  </div>;
}

// Inline markdown renderer for unfocused blocks. React elements only: no HTML injection.
const inlineRe = /\[@([^\]]*)\]\(#issue-([0-9a-f-]{36})\)|\[([^\]]+)\]\(([^)\s]+)\)|\*\*([^*]+)\*\*|`([^`]+)`|~~([^~]+)~~|\*([^*\s][^*]*)\*/g;
function Inline({ text }: { text: string }) {
  const parts: ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(inlineRe)) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    const key = m.index;
    if (m[2]) parts.push(<a key={key} href={`#issue-${m[2]}`} data-mention={m[2]} className="mx-0.5 inline-flex items-center rounded bg-accent-soft px-1.5 text-[0.92em] font-medium text-accent-ink no-underline hover:bg-accent-soft/70">@{m[1]}</a>);
    else if (m[3]) parts.push(/^(https?:|mailto:|#)/.test(m[4]!) ? <a key={key} href={m[4]} target={m[4]!.startsWith('#') ? undefined : '_blank'} rel="noreferrer" className="text-accent-ink underline decoration-line-strong underline-offset-2">{m[3]}</a> : m[0]);
    else if (m[5]) parts.push(<strong key={key}>{m[5]}</strong>);
    else if (m[6]) parts.push(<code key={key} className="rounded bg-sunken px-1 font-mono text-[0.88em] text-danger">{m[6]}</code>);
    else if (m[7]) parts.push(<s key={key}>{m[7]}</s>);
    else if (m[8]) parts.push(<em key={key}>{m[8]}</em>);
    last = m.index + m[0].length;
  }
  parts.push(text.slice(last));
  return <>{parts}</>;
}
