import { describe, expect, it } from 'vitest';
import { getOpenStatus, isOpenNow, parseOpeningHours, toOpeningHoursString, weekTable } from './openingHours';

// 2026-11-23 is a Monday. Times are local, which is how the parser reads them.
const at = (day: number, hour: number, minute = 0) => new Date(2026, 10, 22 + day, hour, minute);
const MON = 1, TUE = 2, SAT = 6, SUN = 7;

describe('parseOpeningHours', () => {
  it('recognises round-the-clock places', () => {
    expect(parseOpeningHours('24/7')).toBe('always');
    expect(parseOpeningHours('Mo-Su 00:00-24:00')).toBe('always');
  });

  it('returns null for values it cannot represent, rather than guessing', () => {
    expect(parseOpeningHours('sunrise-sunset')).toBeNull();
    expect(parseOpeningHours('Jan-Mar Mo-Fr 09:00-17:00')).toBeNull();
    expect(parseOpeningHours('by appointment')).toBeNull();
    expect(parseOpeningHours(undefined)).toBeNull();
  });

  it('lets a later rule replace an earlier one for the days it names', () => {
    const week = parseOpeningHours('Mo-Su 09:00-21:00; Su off');
    expect(Array.isArray(week)).toBe(true);
    expect((week as number[][][])[6]).toEqual([]);
    expect((week as number[][][])[0]).toEqual([[540, 1260]]);
  });
});

describe('getOpenStatus', () => {
  const hours = 'Mo-Sa 09:00-21:00; Su off';

  it('is open during listed hours and says when it closes', () => {
    const s = getOpenStatus(hours, at(MON, 12));
    expect(s.state).toBe('open');
    expect(s.detail).toBe('Closes 9 pm');
  });

  it('warns when closing within 45 minutes', () => {
    expect(getOpenStatus(hours, at(MON, 20, 30)).state).toBe('closing_soon');
  });

  it('is closed after hours and names the next opening', () => {
    expect(getOpenStatus(hours, at(MON, 22))).toMatchObject({ state: 'closed', detail: 'Opens 9 am tomorrow' });
    expect(getOpenStatus(hours, at(MON, 7))).toMatchObject({ state: 'closed', detail: 'Opens 9 am' });
  });

  it('skips closed days when finding the next opening', () => {
    expect(getOpenStatus(hours, at(SAT, 22))).toMatchObject({ state: 'closed', detail: 'Opens 9 am Mon' });
    expect(getOpenStatus(hours, at(SUN, 12)).state).toBe('closed');
  });

  it('handles a lunch break', () => {
    const split = 'Mo-Fr 09:00-13:00,15:00-19:00';
    expect(isOpenNow(split, at(TUE, 10))).toBe(true);
    expect(isOpenNow(split, at(TUE, 14))).toBe(false);
    expect(getOpenStatus(split, at(TUE, 14)).detail).toBe('Opens 3 pm');
    expect(isOpenNow(split, at(TUE, 16))).toBe(true);
  });

  it('keeps overnight hours open past midnight', () => {
    const late = 'Mo-Su 18:00-02:00';
    expect(isOpenNow(late, at(TUE, 1))).toBe(true);
    expect(isOpenNow(late, at(TUE, 3))).toBe(false);
    expect(isOpenNow(late, at(TUE, 19))).toBe(true);
  });

  it('reports unknown instead of open or closed when hours are missing or unreadable', () => {
    expect(getOpenStatus(undefined, at(MON, 12))).toMatchObject({ state: 'unknown', label: 'Hours not listed' });
    expect(getOpenStatus('sunrise-sunset', at(MON, 12)).state).toBe('unknown');
    expect(isOpenNow(undefined)).toBeNull();
  });

  it('labels 24/7 places', () => {
    expect(getOpenStatus('24/7', at(SUN, 3))).toMatchObject({ state: 'open', label: 'Open 24 hours', alwaysOpen: true });
  });
});

describe('weekTable and toOpeningHoursString', () => {
  it('lists every day with today marked', () => {
    const table = weekTable('Mo-Sa 09:00-21:00; Su off', at(TUE, 12))!;
    expect(table).toHaveLength(7);
    expect(table[1]).toMatchObject({ day: 'Tuesday', isToday: true, text: '9 am – 9 pm' });
    expect(table[6]).toMatchObject({ closed: true, text: 'Closed' });
  });

  it('round-trips the business portal week editor', () => {
    const open = { closed: false, open: '09:00', close: '18:00' };
    const str = toOpeningHoursString({ mo: open, tu: open, we: open, th: open, fr: open, sa: { closed: false, open: '10:00', close: '14:00' }, su: { closed: true, open: '', close: '' } });
    expect(str).toBe('Mo-Fr 09:00-18:00; Sa 10:00-14:00; Su off');
    expect(isOpenNow(str, at(SAT, 11))).toBe(true);
    expect(isOpenNow(str, at(SUN, 11))).toBe(false);
  });
});
