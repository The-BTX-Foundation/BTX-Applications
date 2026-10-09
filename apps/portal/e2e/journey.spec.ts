import { expect, test } from '@playwright/test';

// The screens after she submits, in mock mode (no database): every status state, booking, changing the time, "None of
// these times work", the decision and the photo and story page, plus the emails. No sending happens anywhere.

const states: [string, RegExp][] = [
  ['before-booking', /Your turn, Ebony\./],
  ['sent', /Finding you a time, Ebony\./],
  ['booked', /You're booked, Ebony\./],
  ['switched', /Switched to Wed.Oct.7, Ebony\./],
  ['soon', /Two days to go, Ebony\./],
  ['today', /Good luck today, Ebony\./],
  ['after', /Interview done, Ebony\./],
  ['won', /Congratulations, Ebony\./],
  ['won-sent', /Congratulations, Ebony\./],
  ['not-picked', /Thank you, Ebony\./],
];

for (const [demo, heading] of states) {
  test(`status state ${demo}`, async ({ page }) => {
    await page.goto(`/status?demo=${demo}`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(heading);
    await page.goto(`/status?demo=${demo}-stress`);
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Adaeze-Grace');
  });
}

test('the waiting screen is still the default in mock mode', async ({ page }) => {
  await page.goto('/status');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Application submitted.');
});

test('book an open time from the status screen', async ({ page }) => {
  await page.goto('/status?demo=before-booking');
  await page.getByRole('link', { name: 'Book your interview' }).click();
  await expect(page).toHaveURL(/\/status\/schedule/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Schedule your interview.');
  // nothing picked: the book button asks for a time
  await page.getByRole('button', { name: 'Book Tue Oct 6, 6:00 PM' }).click(); // the sample frame has Oct 6 picked
  await expect(page).toHaveURL(/demo=booked/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText("You're booked, Ebony.");
  await expect(page.getByText('Tue Oct 6', { exact: true }).first()).toBeVisible();
});

test('pick a different time before booking', async ({ page }) => {
  await page.goto('/status/schedule?demo=schedule');
  await page.getByRole('button', { name: 'Wed Sep 16, 12:00 PM', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Wed Sep 16, 12:00 PM', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Book Wed Sep 16, 12:00 PM' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText("You're booked, Ebony.");
  await expect(page.getByText('Wed Sep 16', { exact: true }).first()).toBeVisible();
});

test('the time was just taken', async ({ page }) => {
  await page.goto('/status/schedule?demo=taken');
  await expect(page.getByRole('status').filter({ hasText: 'was just taken' })).toHaveText('Tue Oct 6 at 6:00 PM was just taken. Pick another time.');
  await expect(page.getByRole('button', { name: 'Tue Oct 6, 6:00 PM', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Book a time' }).click();
  await expect(page.locator('main [role=alert]')).toContainText('Pick a time first.');
});

test('change your time switches at once', async ({ page }) => {
  await page.goto('/status?demo=soon');
  await page.getByRole('link', { name: 'Change your time' }).click();
  await expect(page).toHaveURL(/\/status\/change/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Change your time.');
  await expect(page.getByText('Your time now').first()).toBeVisible();
  await page.getByRole('button', { name: 'Thu Oct 8, 6:00 PM', exact: true }).click();
  await page.getByRole('button', { name: 'Switch to Thu Oct 8, 6:00 PM' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Switched to Thu');
});

test('none of these times work: no fit sends free times, a fit books a time', async ({ page }) => {
  await page.goto('/status/schedule?demo=schedule');
  await page.getByRole('link', { name: 'None of these times work' }).first().click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText("Tell us when you're free.");
  await expect(page.getByText('No open times fit.')).toBeVisible();
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Finding you a time, Ebony.');
  await expect(page.getByText('Sundays, mornings.')).toBeVisible();

  // Saturday mornings have open times
  await page.goto('/status/no-time?demo=no-time');
  await page.getByRole('button', { name: 'Sun' }).click();
  await page.getByRole('button', { name: 'Sat' }).click();
  await expect(page.getByText(/open times? fits? what you picked\./)).toBeVisible();
  await page.getByRole('button', { name: 'Sat Sep 19, 10:00 AM', exact: true }).click();
  await page.getByRole('button', { name: 'Book Sat Sep 19, 10:00 AM' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText("You're booked, Ebony.");
});

test('empty free times are refused with a message', async ({ page }) => {
  await page.goto('/status/no-time');
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(page.locator('main [role=alert]')).toContainText('Pick at least one day and one time.');
});

test('the winner adds a photo and story', async ({ page }) => {
  await page.goto('/status?demo=won');
  await page.getByRole('link', { name: 'Add your photo and story' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Your photo and story.');
  await expect(page.getByText('16 of 100 words')).toBeVisible();
  await page.getByLabel('A few lines about you').fill(Array(101).fill('word').join(' '));
  await page.getByRole('button', { name: 'Send to BTX' }).click();
  await expect(page.locator('main [role=alert]')).toContainText('Shorten your story by 1 word.');
  await page.getByLabel('A few lines about you').fill('I build bridges.');
  await page.getByRole('button', { name: 'Send to BTX' }).click();
  await expect(page.getByText('Photo and story sent')).toBeVisible();
});

test('the not-picked screen never mentions other awards and the winner screen says Congratulations', async ({ page }) => {
  await page.goto('/status?demo=not-picked');
  const text = (await page.locator('main').innerText()).toLowerCase();
  expect(text).not.toMatch(/other award|another award|empowerment/);
  expect(text).not.toContain('trips');
  await page.goto('/status?demo=won');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Congratulations');
});

test('load errors on the booking pages show the shared block', async ({ page }) => {
  for (const url of ['/status?demo=error', '/status/schedule?demo=error', '/status/change?demo=error']) {
    await page.goto(url);
    await expect(page.locator('.es[role=alert]')).toContainText("This page didn't load.");
  }
});

test('the three emails preview in mock mode', async ({ request }) => {
  const book = await (await request.get('/email-preview?email=book')).text();
  expect(book).toContain('Interview times are open.');
  expect(book).toContain('/status/schedule');
  const won = await (await request.get('/email-preview?email=won')).text();
  expect(won).toContain('Congratulations, Ebony.');
  const not = await (await request.get('/email-preview?email=not-picked')).text();
  expect(not).toContain('Thank you, Ebony.');
  expect(not.toLowerCase()).not.toMatch(/other award|another award/);
});

test('a non-Terpmail refusal shows the sign-in copy and a sign-out link', async ({ page }) => {
  for (const url of ['/apply/review?demo=terpmail', '/apply/start?demo=terpmail']) {
    await page.goto(url);
    await expect(page.locator('main [role=alert]')).toContainText('Use your Terpmail address, like yourname@terpmail.umd.edu.');
    await expect(page.getByRole('link', { name: 'Sign out and sign in again' })).toBeVisible();
  }
});

// Phone screens never scroll sideways.
const phonePages = [
  '/status?demo=before-booking', '/status?demo=sent', '/status?demo=booked', '/status?demo=switched', '/status?demo=soon', '/status?demo=today',
  '/status?demo=after', '/status?demo=won', '/status?demo=won-sent', '/status?demo=not-picked', '/status?demo=won-stress', '/status?demo=not-picked-stress',
  '/status/schedule?demo=schedule', '/status/schedule?demo=schedule-stress', '/status/schedule?demo=taken', '/status/change?demo=change',
  '/status/change?demo=change-stress', '/status/no-time?demo=no-time', '/status/no-time?demo=no-time-stress', '/status/story?demo=story-stress',
];
test.describe('phone width', () => {
  test.use({ viewport: { width: 390, height: 844 } });
  for (const url of phonePages) {
    test(`no sideways scroll on ${url}`, async ({ page }) => {
      await page.goto(url);
      await page.waitForLoadState('networkidle');
      const wide = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
      expect(wide).toBe(false);
    });
  }
});
