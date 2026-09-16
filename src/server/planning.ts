import type { PlanningGoal, Progress } from '../contracts/items.js';
import { listEpics, listGoals, listIssues } from './work.js';

export async function planningTree(ownerId: string): Promise<PlanningGoal[]> {
  const [goals, epics, issues] = await Promise.all([listGoals(ownerId), listEpics(ownerId), listIssues(ownerId)]);
  const issuesByEpic = grouped(issues, (issue) => issue.epicId);
  const epicsByGoal = grouped(epics, (epic) => epic.goalId);

  return goals.map((goal) => {
    const goalEpics = (epicsByGoal.get(goal.id) ?? []).map((epic) => {
      const epicIssues = issuesByEpic.get(epic.id) ?? [];
      return { ...epic, issues: epicIssues, progress: progress(epicIssues) };
    });
    return { ...goal, epics: goalEpics, progress: progress(goalEpics.flatMap((epic) => epic.issues)) };
  });
}

function progress(issues: { status: string }[]): Progress {
  const total = issues.length;
  const done = issues.filter((issue) => issue.status === 'done').length;
  return { done, total, ratio: total ? done / total : 0 };
}

function grouped<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  return items.reduce((groups, item) => {
    const id = key(item);
    groups.set(id, [...(groups.get(id) ?? []), item]);
    return groups;
  }, new Map<string, T[]>());
}
