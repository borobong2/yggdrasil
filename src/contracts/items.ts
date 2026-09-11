export type CoreType = 'inbox' | 'document' | 'project' | 'issue';

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
