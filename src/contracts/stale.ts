// YG-41 방치 감지 thresholds — the one place they live. Suggest only: nothing is ever moved automatically.
export const STALE_OVERDUE_DAYS = 14;
export const STALE_UNTOUCHED_DAYS = 30;

export function staleReasons(stale: { overdueDays: number | null; untouchedDays: number | null }): string[] {
  return [stale.overdueDays !== null && `마감 ${stale.overdueDays}일 지남`, stale.untouchedDays !== null && `${stale.untouchedDays}일 동안 그대로`].filter((value): value is string => Boolean(value));
}

/** YG-34 밀린 일 age buckets: 어제~3일 / 이번 달(≤ 30일) / 한 달 넘음. */
export const lateBuckets = [['recent', '어제~3일'], ['month', '이번 달'], ['older', '한 달 넘음']] as const;
export const lateBucket = (age: number) => age <= 3 ? 'recent' : age <= 30 ? 'month' : 'older';
