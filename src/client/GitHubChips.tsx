import { CircleCheck, CircleX, GitMerge, GitPullRequest, GitPullRequestClosed, Rocket } from 'lucide-react';
import type { Issue } from '../contracts/items.js';

const prTones: Record<string, string> = { open: 'bg-info-soft text-info', merged: 'bg-accent-soft text-accent-ink', closed: '' };
const prIcons = { open: GitPullRequest, merged: GitMerge, closed: GitPullRequestClosed };
const prLabels: Record<string, string> = { open: '열림', merged: '병합됨', closed: '닫힘' };

/** Ticket key + GitHub PR / CI / deploy chips (YG-24). Renders nothing for issues without them. */
export function GitHubChips({ issue }: { issue: Pick<Issue, 'key' | 'github'> }) {
  const pr = issue.github?.pr;
  const deploy = issue.github?.deploy;
  const PrIcon = pr ? prIcons[pr.state as keyof typeof prIcons] ?? GitPullRequest : null;
  return <>
    {issue.key && <span className="badge font-mono">{issue.key}</span>}
    {pr && PrIcon && <a href={pr.url} target="_blank" rel="noreferrer" className={`badge hover:underline ${prTones[pr.state] ?? ''}`} title={`PR #${pr.number} ${prLabels[pr.state] ?? pr.state}`}>
      <PrIcon />#{pr.number}
    </a>}
    {pr?.ci && <a href={`${pr.url}/checks`} target="_blank" rel="noreferrer" className={`badge ${pr.ci === 'success' ? 'bg-accent-soft text-accent-ink' : 'bg-danger-soft text-danger'}`} title={`CI ${pr.ci}`}>
      {pr.ci === 'success' ? <CircleCheck /> : <CircleX />}CI
    </a>}
    {deploy && <a href={deploy.url} target="_blank" rel="noreferrer" className="badge bg-accent-soft text-accent-ink hover:underline" title="배포됨"><Rocket />배포</a>}
  </>;
}
