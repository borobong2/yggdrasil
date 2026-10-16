import {expect,it} from 'vitest';
import {weekStart,monthGrid,rangeOf} from '../src/client/calendar-dates.js';
it('starts Sunday including Sunday itself and covers month/year boundaries without gaps',()=>{
 expect(weekStart('2026-10-18')).toBe('2026-10-18');
 expect(weekStart('2026-10-17')).toBe('2026-10-11');
 expect(rangeOf('week','2027-01-01')).toEqual({from:'2026-12-27',to:'2027-01-02'});
 for(const day of ['2026-02-01','2026-03-31','2027-01-01','2028-02-29']){
  const grid=monthGrid(day);expect(new Set(grid).size).toBe(grid.length);expect(grid.length%7).toBe(0);
  expect(new Date(`${grid[0]}T00:00:00Z`).getUTCDay()).toBe(0);
  expect(new Date(`${grid.at(-1)}T00:00:00Z`).getUTCDay()).toBe(6);
  expect(grid).toContain(day);
 }
});
