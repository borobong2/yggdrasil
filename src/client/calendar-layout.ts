/** Deadline/preview markers reserve 30 minutes of visual space, never an estimated work duration. */
export const calendarBlockMinutes = (minutes: number, estimate: number | null, planned: boolean) =>
  Math.min(1440 - minutes, Math.max(planned ? estimate ?? 30 : 30, 20));

/** Sorted intervals share width only with their connected overlap group. */
export function timeLanes<T extends { minutes: number; length: number }>(items: T[]) {
  const placed: (T & { lane: number; lanes: number })[] = [];
  let group = 0;
  let groupEnd = -1;
  let ends: number[] = [];
  const finish = () => { for (let i = group; i < placed.length; i++) placed[i]!.lanes = ends.length; };
  for (const item of items) {
    if (item.minutes >= groupEnd) { finish(); group = placed.length; ends = []; }
    let lane = ends.findIndex(end => end <= item.minutes);
    if (lane < 0) lane = ends.length;
    ends[lane] = item.minutes + item.length;
    groupEnd = Math.max(...ends);
    placed.push({ ...item, lane, lanes: 1 });
  }
  finish();
  return placed;
}
