// Parses one-thing todo markdown (checkbox lines + `###` blocks) into import records. Pure: no IO.
export type Hold = 'waiting' | 'blocked' | 'scheduled';
export type TodoPriority = 'p1' | 'p2' | 'p3' | 'p4';
export type ParsedTodo = {
  area: string; epic: string; title: string; status: 'backlog' | 'todo'; hold: Hold | null; holdReason: string | null;
  priority: TodoPriority; dueAt: string | null; scheduledAt: string | null; estimateMinutes: number | null;
  notes: string; source: string; line: number;
};
export type ParseIssue = { source: string; line: number; text: string; reason: string };
export type ParseResult = { todos: ParsedTodo[]; skipped: ParseIssue[]; warnings: ParseIssue[] };

export const areas: Record<string, string> = { career: '커리어', personal: '개인', routine: '루틴', errands: '잡일', income: '수익화', 'real-estate': '부동산', wedding: '결혼' };
// ponytail: every todo goes to the "일반" epic; per-section epics when someone actually wants them.
export const defaultEpic = '일반';

const date = /\d{4}-\d{2}-\d{2}/;
const doneStates = new Set(['done', 'completed']);

function mapState(state: string | undefined): Pick<ParsedTodo, 'status' | 'hold'> | 'done' | null {
  switch (state) {
    case undefined: case 'next': return { status: 'todo', hold: null };
    case 'inbox': return { status: 'backlog', hold: null };
    case 'waiting': case 'blocked': case 'scheduled': return { status: 'todo', hold: state };
    default: return state && doneStates.has(state) ? 'done' : null;
  }
}

/** "1h 30m" | "45m" | "1.5h" → minutes; anything vaguer → null. */
export function parseEstimate(value: string): number | null {
  const match = value.trim().match(/^(?:(\d+(?:\.\d+)?)h)?\s*(?:(\d+)m)?$/);
  if (!match || (!match[1] && !match[2])) return null;
  return Math.round(Number(match[1] ?? 0) * 60 + Number(match[2] ?? 0));
}

export function parseOneThing(markdown: string, source: string): ParseResult {
  const file = source.split('/').pop()!.replace(/\.md$/, '');
  const area = areas[file];
  const result: ParseResult = { todos: [], skipped: [], warnings: [] };
  if (!area) { result.warnings.push({ source, line: 0, text: file, reason: 'unknown area file' }); return result; }
  const lines = markdown.split('\n');
  const warn = (line: number, text: string, reason: string) => result.warnings.push({ source, line, text, reason });

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]!;
    const heading = raw.match(/^###\s+(?:\S+\s+)?\[P([1-4])\]\s+(.+)$/u);
    if (heading) {
      const fields = new Map<string, string>();
      let j = i + 1;
      for (; j < lines.length && !/^(#|---)/.test(lines[j]!); j++) {
        const field = lines[j]!.match(/^- \*\*(.+?)\*\*:\s*(.*)$/);
        if (field) fields.set(field[1]!, field[2]!.trim());
        else if (lines[j]!.trim()) warn(j + 1, lines[j]!, 'unrecognized line inside block (ignored)');
      }
      addBlock(i + 1, heading[2]!.trim(), `p${heading[1]}` as TodoPriority, fields);
      i = j - 1;
      continue;
    }
    if (/^###\s/.test(raw)) { warn(i + 1, raw, 'heading without [P1-4] (ignored)'); continue; }
    const box = raw.match(/^- \[( |x|X)\]\s+(.+)$/);
    if (box) {
      if (box[1] !== ' ') { result.skipped.push({ source, line: i + 1, text: box[2]!, reason: 'done [x]' }); continue; }
      addCheckbox(i + 1, box[2]!);
    }
  }
  return result;

  function push(line: number, todo: Omit<ParsedTodo, 'area' | 'epic' | 'source' | 'line'>) {
    result.todos.push({ area, epic: defaultEpic, source, line, ...todo });
  }

  function addBlock(line: number, title: string, priority: TodoPriority, fields: Map<string, string>) {
    const state = mapState(fields.get('상태'));
    if (state === 'done') { result.skipped.push({ source, line, text: title, reason: `status ${fields.get('상태')}` }); return; }
    if (!state) warn(line, title, `unknown status "${fields.get('상태')}" → todo`);
    if (!fields.has('상태')) warn(line, title, 'no 상태 field → todo');
    const due = fields.get('마감');
    const dueAt = due?.match(date)?.[0] ?? null;
    if (due && !dueAt) warn(line, title, `마감 "${due}" has no date`);
    const estimateText = fields.get('예상시간');
    const estimateMinutes = estimateText ? parseEstimate(estimateText) : null;
    if (estimateText && estimateMinutes === null && estimateText !== '-') warn(line, title, `예상시간 "${estimateText}" kept in notes`);
    const scheduledAt = fields.get('예정')?.match(date)?.[0] ?? null;
    // Keep every field that was not consumed exactly, so nothing is lost.
    const consumed = (key: string, value: string) => key === '상태' || (key === '마감' && value === dueAt) || (key === '예상시간' && (estimateMinutes !== null || value === '-'));
    const notes = [...fields].filter(([key, value]) => !consumed(key, value)).map(([key, value]) => `${key}: ${value}`).join('\n');
    push(line, { title, ...(state ?? { status: 'todo', hold: null }), holdReason: fields.get('대기') ?? null, priority, dueAt, scheduledAt, estimateMinutes, notes });
  }

  function addCheckbox(line: number, text: string) {
    const meta = text.match(/^(?:[🔴🟡🟢⚪]\s*)?(?:P([1-4])\s*·\s*)?(?:`(\w+)`\s*·\s*)?(.*)$/u)!;
    const [, p, stateText, rest] = meta;
    const state = mapState(stateText);
    if (state === 'done') { result.skipped.push({ source, line, text, reason: `status ${stateText}` }); return; }
    if (!state) warn(line, text, `unknown status "${stateText}" → todo`);
    const bold = rest!.match(/^\*\*(.+?)\*\*\s*(.*)$/);
    let title: string; let notes: string;
    if (bold) { title = bold[1]!; notes = bold[2]!; }
    else {
      // Unbolded: title ends at the first " (" or ". " — whichever comes first.
      const cut = [rest!.indexOf(' ('), rest!.indexOf('. ')].filter((n) => n > 0);
      const end = cut.length ? Math.min(...cut) : rest!.length;
      title = rest!.slice(0, end).replace(/\.$/, ''); notes = rest!.slice(end);
      if (title.length > 60) warn(line, title, 'long unbolded title (no clear end)');
    }
    notes = notes.replace(/^[.\s]+/, '').trim();
    const dueAt = text.match(/마감 (\d{4}-\d{2}-\d{2})/)?.[1] ?? null;
    if (!dueAt && /마감 /.test(text)) warn(line, title, '마감 without full date');
    const hold = state ? state.hold : null;
    const scheduledAt = text.match(/예정 (\d{4}-\d{2}-\d{2})/)?.[1] ?? (hold === 'scheduled' ? text.match(/\((\d{4}-\d{2}-\d{2})\)/)?.[1] ?? null : null);
    if (hold === 'scheduled' && !scheduledAt) warn(line, title, 'scheduled without date (recurring?)');
    const estimate = text.match(/예상 ([\dhm. ]+?)(?=[,)])/)?.[1];
    push(line, {
      title, ...(state ?? { status: 'todo', hold: null }), holdReason: text.match(/대기:\s*([^)]+)\)/)?.[1]?.trim() ?? null,
      priority: p ? `p${p}` as TodoPriority : 'p3', dueAt, scheduledAt, estimateMinutes: estimate ? parseEstimate(estimate) : null, notes
    });
  }
}
