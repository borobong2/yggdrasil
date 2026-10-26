import { expect, it } from 'vitest';
import { timeLanes, calendarBlockMinutes } from '../src/client/calendar-layout.js';

it('sizes each connected overlap group independently, including chained overlaps', () => {
  const items = [{ minutes: 540, length: 60 }, { minutes: 550, length: 60 }, { minutes: 560, length: 60 }, { minutes: 610, length: 60 }, { minutes: 720, length: 30 }];
  const placed = timeLanes(items);
  expect(placed.map(x => x.lanes)).toEqual([3, 3, 3, 3, 1]);
  expect(placed.map(x => x.lane)).toEqual([0, 1, 2, 0, 0]);
});
it('does not turn deadlines into estimated work and clips blocks at midnight', () => {
  expect(calendarBlockMinutes(540, 180, false)).toBe(30);
  expect(calendarBlockMinutes(540, 180, true)).toBe(180);
  expect(calendarBlockMinutes(1439, 120, true)).toBe(1);
  expect(calendarBlockMinutes(0, null, true)).toBe(30);
});
