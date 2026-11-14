import { formatDate } from '../../../src/i18n';
import { buildReport } from '../../../src/pages/report/model';
import { createSamplePedigree } from '../../../src/domain';

// The report date must be the user's own calendar day, the same day the ages on
// the page are computed for, not the UTC day.
// Changing process.env.TZ at run time works in Vitest's default forked processes, which
// `npm run test` uses; it does not in worker threads.

const originalTz = process.env.TZ;
afterEach(() => {
  process.env.TZ = originalTz;
});

describe('report dates follow the user\'s own clock', () => {
  it.each([
    // 2026-12-31 10:30 UTC is already 1 January 2027 at 00:30 in Kiritimati (UTC+14).
    ['Pacific/Kiritimati', '2026-12-31T10:30:00Z', '1 January 2027', 2027],
    // 2027-01-01 07:00 UTC is still 31 December 2026 at 20:00 in Pago Pago (UTC-11).
    ['Pacific/Pago_Pago', '2027-01-01T07:00:00Z', '31 December 2026', 2026],
    // A leap day stays a leap day.
    ['Europe/London', '2028-02-29T23:30:00Z', '29 February 2028', 2028],
  ])('in %s, %s reads as %s', (zone, instant, expected, year) => {
    process.env.TZ = zone;
    const today = new Date(instant);
    expect(today.getFullYear()).toBe(year);
    expect(formatDate(today)).toBe(expected);
    const report = buildReport(createSamplePedigree(), { hideNames: false, referenceYear: today.getFullYear(), today });
    expect(report.date).toContain(expected);
  });

  it('an ISO calendar date reads the same in every time zone', () => {
    for (const zone of ['Pacific/Kiritimati', 'Pacific/Pago_Pago', 'UTC']) {
      process.env.TZ = zone;
      expect(formatDate('2026-11-11')).toBe('11 November 2026');
    }
  });
});
