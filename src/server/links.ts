import { z } from 'zod';
import type { IssueLink } from '../contracts/items.js';

// YG-42 todo links. doc = a Yggdrasil document id in `path` (opens in the 문서 tab) or an external doc `url`.
export const issueLink = z.object({
  label: z.string().trim().min(1).max(200),
  url: z.url({ protocol: /^https?$/ }).max(2000).optional().describe('http(s) only'),
  path: z.string().trim().min(1).max(1000).optional().describe("Local path like '~/notes/x.md', or a document id for kind 'doc'"),
  kind: z.enum(['doc', 'web', 'local', 'pr'])
}).strict()
  .refine((link) => link.kind === 'local' ? !!link.path : link.kind === 'doc' ? !!link.url || z.uuid().safeParse(link.path).success : !!link.url,
    "web/pr need url, local needs path, doc needs url or a document id in path");
export const issueLinks = z.array(issueLink).max(20).describe('Links shown on the todo (max 20). Replaces the whole list.');
export const linkEdits = {
  addLinks: z.array(issueLink).max(20).optional().describe('Append links (total stays ≤ 20)'),
  removeLinks: z.array(z.string().min(1)).max(20).optional().describe('Remove links whose url, path or label equals one of these')
};

/** Applies addLinks/removeLinks to the current list; throws past 20 so the DB check is never the first line. */
export function editLinks(current: IssueLink[], add: IssueLink[] = [], remove: string[] = []): IssueLink[] {
  const next = [...current.filter((link) => ![link.url, link.path, link.label].some((value) => value !== undefined && remove.includes(value))), ...add];
  if (next.length > 20) throw new RangeError('At most 20 links');
  return next;
}
