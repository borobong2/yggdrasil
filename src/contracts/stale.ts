// YG-41 방치 감지 thresholds — the one place they live. Suggest only: nothing is ever moved automatically.
export const STALE_OVERDUE_DAYS = 14;
export const STALE_UNTOUCHED_DAYS = 30;

export function staleReasons(stale: { overdueDays: number | null; untouchedDays: number | null }): string[] {
  return [stale.overdueDays !== null && `마감 ${stale.overdueDays}일 지남`, stale.untouchedDays !== null && `${stale.untouchedDays}일 동안 그대로`].filter((value): value is string => Boolean(value));
}
