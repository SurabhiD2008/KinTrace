import { expect, test } from '../guard';
import { family, seedOnce } from './helpers';

// The clock and the time zone come from the browser, and the
// page reads them once. Ages from a birth year follow that year; the report
// date is the user's own calendar day.

const withBirthYear = () =>
  family({
    people: 'me:f mum:f dad:m',
    details: { me: { birthYear: 1990 }, mum: { birthYear: 1960, conditions: [{ id: 'c1', code: 'breast', domain: 'cancer', ageAtOnset: 38, ageUnknown: false, confirmed: 'confirmed', laterality: 'left' }] } },
    bio: 'me<mum+dad',
  });

test.describe('in UTC', () => {
  test.use({ timezoneId: 'UTC' });
  for (const [instant, year, date] of [
    ['2026-12-31T23:59:00Z', 2026, '31 December 2026'],
    ['2027-01-01T00:00:00Z', 2027, '1 January 2027'],
    ['2028-02-29T12:00:00Z', 2028, '29 February 2028'],
  ] as const) {
    test(`At ${instant}, ages from birth years use ${year} and the report is dated ${date}`, async ({ page }) => {
      await page.clock.setFixedTime(new Date(instant));
      await seedOnce(page, withBirthYear());
      await page.goto('/findings');
      await page.locator('[data-person-id="mum"]').first().click();
      await expect(page.getByText(`Age ${year - 1960}`)).toBeVisible();
      await page.goto('/report');
      await expect(page.getByText(date).first()).toBeVisible();
    });
  }
});

for (const [zone, instant, date] of [
  // 10:30 UTC on 31 December is already 00:30 on 1 January in Kiritimati (UTC+14).
  ['Pacific/Kiritimati', '2026-12-31T10:30:00Z', '1 January 2027'],
  // 07:00 UTC on 1 January is still 20:00 on 31 December in Pago Pago (UTC-11).
  ['Pacific/Pago_Pago', '2027-01-01T07:00:00Z', '31 December 2026'],
] as const) {
  test.describe(`in ${zone}`, () => {
    test.use({ timezoneId: zone });
    test(`The report date is the local day: ${date}`, async ({ page }) => {
      await page.clock.setFixedTime(new Date(instant));
      await seedOnce(page, withBirthYear());
      await page.goto('/report');
      await expect(page.getByText(date).first()).toBeVisible();
      // The year used for ages matches the date shown.
      const year = Number(date.slice(-4));
      await page.goto('/findings');
      await page.locator('[data-person-id="mum"]').first().click();
      await expect(page.getByText(`Age ${year - 1960}`)).toBeVisible();
    });
  });
}
