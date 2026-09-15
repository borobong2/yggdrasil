export type CoreType = 'inbox' | 'document' | 'project' | 'issue';

export type WorkKind = 'goal' | 'epic' | 'issue';
export type IssueStatus = 'backlog' | 'todo' | 'doing' | 'done';
export type Priority = 'low' | 'medium' | 'high';

type WorkRecord = { id: string; title: string; createdAt: string; updatedAt: string };
export type Goal = WorkRecord;
export type Epic = WorkRecord & { goalId: string };
export type Issue = WorkRecord & { epicId: string; status: IssueStatus; priority: Priority; dueAt: string | null };

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
