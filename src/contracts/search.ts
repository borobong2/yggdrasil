export type SearchResult = {
  kind: 'document' | 'goal' | 'epic' | 'issue' | 'capture';
  id: string;
  title: string;
  preview: string;
};
