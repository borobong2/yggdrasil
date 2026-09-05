export type CoreType = 'inbox' | 'document' | 'project' | 'issue';

export type Capture = {
  id: string;
  text: string;
  status: 'inbox';
  createdAt: string;
};
