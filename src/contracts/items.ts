export type CoreType = 'inbox' | 'document' | 'project' | 'issue';

export type WorkKind = 'goal' | 'epic' | 'issue';
export type IssueStatus = 'backlog' | 'todo' | 'doing' | 'done';
export type Priority = 'p1' | 'p2' | 'p3' | 'p4';
export type Hold = 'waiting' | 'blocked' | 'scheduled';
export type EvidenceKind = 'github_pr' | 'github_commit' | 'github_branch' | 'deployment';
export type EvidenceStatus = 'linked';

type WorkRecord = { id: string; title: string; createdAt: string; updatedAt: string };
export type Goal = WorkRecord;
/** keyPrefix (YG-36): new todos in this epic get the next `PREFIX-n` key unless created with prefix: null. */
export type Epic = WorkRecord & { goalId: string; keyPrefix: string | null };
/** `dueAllDay`/`scheduledAllDay` (YG-38): the date was given without a time and means that whole Asia/Seoul day (stored at its 00:00). */
export type Issue = WorkRecord & { epicId: string; status: IssueStatus; position: number; priority: Priority; dueAt: string | null; dueAllDay: boolean;
  hold: Hold | null; holdReason: string | null; scheduledAt: string | null; scheduledAllDay: boolean; targetAt: string | null; targetAllDay: boolean; notes: string; estimateMinutes: number | null; /** YG-43 */ actualMinutes: number | null; source: string | null; key: string | null;
  /** YG-37: when it was done (null unless status is done). YG-39: archived todos are hidden from every list. */
  completedAt: string | null; archivedAt: string | null; github?: GitHubSummary | null; recurrence?: Recurrence | null;
  /** YG-42 */ links: IssueLink[] };
/** YG-42: doc → Yggdrasil document id in `path` or an external `url`; web/pr → `url` (http/https); local → `path`. */
export type IssueLink = { label: string; url?: string; path?: string; kind: 'doc' | 'web' | 'local' | 'pr' };
export type Todo = Issue & { area: string; epic: string };
export type Weekday = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';
/** YG-28 series rule. Times are Asia/Seoul 'HH:mm'; monthDay past the month's end means its last day. */
export type Recurrence = { id: string; freq: 'daily' | 'weekly' | 'monthly'; weekdays: Weekday[] | null; monthDay: number | null; time: string | null; paused: boolean };
export type TodoVia = 'ui' | 'mcp' | 'import';
/** YG-30: a future occurrence of an active series, computed for display only (no row). `todoId` is the series' open occurrence. */
export type CalendarDateBasis = 'effective' | 'due' | 'scheduled';
export type CalendarGhost = { recurrenceId: string; todoId: string; title: string; priority: Priority; at: string; allDay: boolean };
export type CalendarView = { from: string; to: string; todos: Todo[]; undated: Todo[]; ghosts: CalendarGhost[] };
/**
 * YG-34 밀린 일: one list replacing 마감 지남 + 방치 (no duplicates). Unheld todo/doing todos due before today (Asia/Seoul day), or stale (YG-41).
 * `lateDays` = Seoul days past due (null when not past due); `untouchedDays` = days since the last change; `age` = lateDays ?? untouchedDays.
 * bucket: recent ≤ 3 days, month ≤ 30, older > 30. Sorted oldest first.
 */
export type LateBucket = 'recent' | 'month' | 'older';
export type LateTodo = Todo & { lateDays: number | null; untouchedDays: number; age: number; bucket: LateBucket };
/** `overdue` keeps the YG-38 meaning (MCP todo://overdue). `late` and `timeline` (timed todos + ghost occurrences today) are YG-34. */
export type TodayView = { date: string; today: Todo[]; overdue: Todo[]; waiting: Todo[]; week: Todo[]; late: LateTodo[]; timeline: { todos: Todo[]; ghosts: CalendarGhost[] } };
/** YG-41: why a todo is stale — days past due (≥ STALE_OVERDUE_DAYS) and/or days since the last change (≥ STALE_UNTOUCHED_DAYS); null when that rule does not apply. */
export type StaleTodo = Todo & { stale: { overdueDays: number | null; untouchedDays: number | null } };
export type StaleView = { date: string; todos: StaleTodo[] };
/** YG-36 settings row: every epic, its default prefix and that prefix's next number. */
export type EpicPrefix = { epicId: string; area: string; epic: string; keyPrefix: string | null; nextNumber: number | null };
/** Fields a bulk action can change (YG-26); sending them back with action 'restore' undoes it. All-day dates come back as 'YYYY-MM-DD'. */
export type TodoSnapshot = Pick<Issue, 'id' | 'status' | 'dueAt' | 'scheduledAt' | 'hold' | 'holdReason'>;
/** `skipped`: restore left these done because their recurring series already has a newer open occurrence (YG-28). */
export type BulkResult = { todos: Todo[]; previous: TodoSnapshot[]; skipped: string[] };
export type DeliveryPlanStatus = 'pending' | 'accepted' | 'dismissed';
export type DeliveryPlanAcceptance = { proposalId: string; captureId: string; documentId: string; goalId: string; epicId: string; issueIds: string[]; acceptedAt: string };
export type DeliveryPlanActivityPayload = { proposalId: string; captureId: string; documentId?: string; goalId?: string; epicId?: string; issueIds?: string[] };
export type Activity = { id: string; ownerId: string; actorId: string; kind: 'issue.created' | 'issue.updated' | 'issue.completed' | 'issue.moved' | 'issue.archived' | 'issue.unarchived' | 'delivery-plan.created' | 'delivery-plan.accepted' | 'delivery-plan.dismissed' | 'evidence.added'
  | 'document.created' | 'document.updated' | 'document.linked' | 'document.unlinked'; subjectType: 'issue' | 'delivery-plan-proposal' | 'document'; subjectId: string; payload: Record<string, unknown>; createdAt: string };
export type IssueEvidence = { id: string; issueId: string; url: string; kind: EvidenceKind; status: EvidenceStatus; createdAt: string;
  state: string | null; ci: string | null; prNumber: number | null; metadata: Record<string, unknown> };
/** Latest GitHub state per issue for card/detail chips (YG-24). */
export type GitHubSummary = { pr: { number: number; url: string; state: string; ci: string | null } | null; deploy: { url: string; state: string } | null };
export type GitHubRepo = { id: string; fullName: string; prefix: string; createdAt: string; lastEventAt: string | null; lastStatus: string | null };

export type DocumentFormat = 'markdown' | 'html';
export type Document = WorkRecord & { format: DocumentFormat; body: string; parentId: string | null; position: number; archivedAt: string | null; icon: string | null };
export type DocumentIssueLink = { documentId: string; issueId: string; createdAt: string };

export type Progress = { done: number; total: number; ratio: number };
export type PlanningEpic = Epic & { progress: Progress; issues: Issue[] };
export type PlanningGoal = Goal & { progress: Progress; epics: PlanningEpic[] };

export type PersonalAccessToken = {
  id: string;
  label: string;
  createdAt: string;
  revokedAt: string | null;
  lastUsedAt: string | null;
};

export type IssuedPersonalAccessToken = PersonalAccessToken & { token: string };

export type Capture = {
  id: string;
  text: string;
  status: 'inbox';
  createdAt: string;
};

export type Suggestion = {
  id: string;
  captureId: string;
  title: string;
  type: CoreType;
  targetId?: string;
  status: 'pending';
  model: { provider: string; name: string };
};

export type DeliveryPlanDesign = { title: string; body: string };
export type DeliveryPlanLanes = { fe: string[]; be: string[]; docs: string[] };

export type DeliveryPlanProposal = {
  id: string;
  captureId: string;
  status: DeliveryPlanStatus;
  design: DeliveryPlanDesign;
  lanes: DeliveryPlanLanes;
  model: { provider: string; name: string };
  createdAt: string;
  acceptance?: DeliveryPlanAcceptance;
};
/** YG-29 아침 브리핑 settings. `missing`: server env names still unset (nothing is sent until empty). `isOwner`: this user is BRIEFING_OWNER_ID. */
export type BriefingSettings = { enabled: boolean; sendTime: string; lastSentDate: string | null; missing: string[]; isOwner: boolean };
