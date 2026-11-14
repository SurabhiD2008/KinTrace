import AxeBuilder from '@axe-core/playwright';
import { expect, test } from './guard';

const EXAMPLE = 'My mum had breast cancer at 38. Her sister had ovarian cancer at 44. My dad had a heart attack at 57.';

test('quick add with AI off: suggest, accept all, see the badges, undo in one step', async ({ page }) => {
  const errors: string[] = [];
  const requests: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => requests.push(request.url()));

  await page.goto('/build');
  await page.getByLabel('Your sex').selectOption('Female');
  await page.getByRole('button', { name: 'Start with me' }).click();
  await page.getByRole('button', { name: 'Not now' }).click();

  const toggle = page.getByRole('checkbox', { name: 'Use AI for longer or non-English text' });
  await expect(toggle).not.toBeChecked();

  await page.getByLabel('Describe your family in your own words').fill(EXAMPLE);
  await page.getByRole('button', { name: 'Suggest entries' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'suggestions' })).toHaveText('3 suggestions.');
  // Nothing is in the tree until it is accepted.
  await expect(page.locator('[data-person-id]')).toHaveCount(1);
  const serious = (await new AxeBuilder({ page }).analyze()).violations.filter(
    (violation) => violation.impact === 'serious' || violation.impact === 'critical',
  );
  expect(serious.map((violation) => violation.id)).toEqual([]);

  await page.getByRole('button', { name: 'Accept all' }).click();
  await expect(page.locator('.kt-suggestion')).toHaveCount(0);
  const labels = page.locator('[data-labels-for]');
  await expect(labels.filter({ hasText: 'Breast 38' })).toHaveCount(1);
  await expect(labels.filter({ hasText: 'Ovarian 44' })).toHaveCount(1);
  await expect(labels.filter({ hasText: 'Heart 57' })).toHaveCount(1);
  // Each badge sits under the right person; names are matched exactly ("Mother" is not "Maternal grandmother").
  const person = (name: string) =>
    labels.filter({ has: page.locator('.kt-node__name').getByText(name, { exact: true }) });
  await expect(person('Mother')).toContainText('Breast 38');
  await expect(person('Father')).toContainText('Heart 57');
  await expect(person('Maternal aunt')).toContainText('Ovarian 44');

  // One undo takes the whole batch back.
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.locator('[data-person-id]')).toHaveCount(1);

  // AI was off: nothing left this site except its font files, and the parser endpoint was never called.
  const origin = new URL(page.url()).origin;
  const outside = requests.filter(
    (url) => !url.startsWith(origin) && !/^https:\/\/fonts\.(googleapis|gstatic)\.com\//.test(url),
  );
  expect(outside).toEqual([]);
  expect(requests.some((url) => url.includes('/api/parse'))).toBe(false);
  expect(errors).toEqual([]);
});
