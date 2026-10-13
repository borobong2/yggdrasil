import type { Activity, IssueStatus } from './items.js';

// YG-44: Korean wording for activity rows, shared by the MCP history (get_history, todo://history) and the 활동 timeline.
export const kindLabels: Record<Activity['kind'], string> = {
  'issue.created': '생성', 'issue.updated': '수정', 'issue.completed': '완료', 'issue.moved': '이동', 'issue.archived': '보관', 'issue.unarchived': '보관 해제',
  'delivery-plan.created': '납품 계획 생성', 'delivery-plan.accepted': '납품 계획 승인', 'delivery-plan.dismissed': '납품 계획 거절', 'evidence.added': '근거 추가',
  'document.created': '문서 생성', 'document.updated': '문서 수정', 'document.linked': '문서 연결', 'document.unlinked': '문서 연결 해제'
};
const viaLabels: Record<string, string> = { mcp: 'Claude·Codex (mcp)', ui: '웹', github: 'GitHub', import: '가져오기' };
const fieldLabels: Record<string, string> = {
  title: '제목', status: '상태', priority: '우선순위', dueAt: '마감', scheduledAt: '예정', hold: '보류', holdReason: '보류 사유', notes: '메모', estimateMinutes: '예상(분)', actualMinutes: '실제(분)',
  area: '영역', epic: '에픽', recurrence: '반복', links: '링크', key: '키', completedAt: '완료일', source: '출처', evidence: '근거', ci: 'CI', body: '본문', append: '본문 추가', parentId: '상위 문서', icon: '아이콘'
};
const statusLabels: Record<IssueStatus, string> = { backlog: '백로그', todo: '할 일', doing: '진행 중', done: '완료' };
const prStates: Record<string, string> = { open: 'PR 열림', merged: 'PR 병합', closed: 'PR 닫힘' };

type Row = Pick<Activity, 'kind' | 'payload'>;
const text = (value: unknown) => typeof value === 'string' ? value : undefined;

/** What happened, in Korean: kind label, or the GitHub event it stands for (PR 열림, CI success, 배포 success …). */
export function activityWhat({ kind, payload }: Row): string {
  if (kind === 'evidence.added' || (kind === 'issue.updated' && Array.isArray(payload.changes) && payload.changes.includes('evidence'))) {
    // Older evidence updates carry only the url, so the kind is read off it.
    const url = String(payload.url ?? '');
    const evidence = text(payload.kind) ?? (/\/pull\/\d+/.test(url) ? 'github_pr' : /\/tree\//.test(url) ? 'github_branch' : undefined);
    if (evidence === 'github_pr') return prStates[String(payload.state)] ?? 'PR 연결';
    if (evidence === 'github_branch') return '브랜치 push';
    if (evidence === 'github_commit') return '커밋 연결';
    if (evidence === 'deployment') return `배포 ${text(payload.state) ?? ''}`.trim();
    return kind === 'evidence.added' ? kindLabels[kind] : '근거 갱신';
  }
  if (kind === 'issue.updated' && Array.isArray(payload.changes) && payload.changes.includes('ci')) return `CI ${String(payload.ci)}`;
  return kindLabels[kind] ?? kind;
}

/** Who did it: Claude·Codex (mcp), 웹, GitHub, 가져오기, plus 일괄 for bulk actions. Board moves before YG-44 carry no via. */
export function activityWho({ kind, payload }: Row): string | null {
  const via = text(payload.via) ?? (kind === 'issue.moved' ? 'ui' : undefined);
  const who = via && (viaLabels[via] ?? via);
  return [who, text(payload.bulk) && '일괄'].filter(Boolean).join(' · ') || null;
}

/** Changed fields as 'label: old → new'. YG-44 rows carry `diff`; older ones only list field names (or from/to for status). */
export function activityChanges({ payload }: Row): string[] {
  const shown = (field: string, value: unknown) => value === null || value === undefined || value === '' ? '없음' : field === 'status' ? statusLabels[value as IssueStatus] ?? String(value) : field === 'priority' ? String(value).toUpperCase() : String(value);
  const diff = payload.diff as Record<string, [unknown, unknown]> | undefined;
  if (diff && typeof diff === 'object') return Object.entries(diff).map(([field, [from, to]]) => `${fieldLabels[field] ?? field}: ${shown(field, from)} → ${shown(field, to)}`);
  if (text(payload.from) && text(payload.to)) return [`${fieldLabels.status}: ${shown('status', payload.from)} → ${shown('status', payload.to)}`];
  return Array.isArray(payload.changes) ? payload.changes.filter((field) => field !== 'evidence' && field !== 'ci').map((field) => fieldLabels[String(field)] ?? String(field)) : [];
}
