export type CoreType = 'inbox' | 'document' | 'project' | 'issue';

export type WorkKind = 'goal' | 'epic' | 'issue';
export type IssueStatus = 'backlog' | 'todo' | 'doing' | 'done';
export type Priority = 'low' | 'medium' | 'high';
export type EvidenceKind = 'github_pr' | 'github_commit' | 'deployment';
export type EvidenceStatus = 'linked';

type WorkRecord = { id: string; title: string; createdAt: string; updatedAt: string };
export type Goal = WorkRecord;
export type Epic = WorkRecord & { goalId: string };
export type Issue = WorkRecord & { epicId: string; status: IssueStatus; priority: Priority; dueAt: string | null };
export type IssueEvidence = { id: string; issueId: string; url: string; kind: EvidenceKind; status: EvidenceStatus; createdAt: string };

export type Document = WorkRecord & { body: string; parentId: string | null };
export type DocumentIssueLink = { documentId: string; issueId: string; createdAt: string };

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
