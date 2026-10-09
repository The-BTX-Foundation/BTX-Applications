import { expect, test } from '@playwright/test';
import path from 'node:path';

const pdf = path.join(__dirname, 'files', 'sample.pdf');

// The whole applicant path in mock mode: sign in with a code, five steps, submit, status page.
test('sign in, complete the five steps, submit and reach the status page', async ({ page }) => {
  // landing -> sign in
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Legacy');
  await page.getByRole('link', { name: 'Start your application' }).first().click();
  await expect(page).toHaveURL(/\/sign-in/);

  // a non-Terpmail address is refused
  await page.getByLabel('Terpmail address').fill('someone@gmail.com');
  await page.getByRole('button', { name: 'Send code' }).click();
  await expect(page.getByText('Use your Terpmail address')).toBeVisible();

  // the right address, a wrong code, then the right code
  await page.getByLabel('Terpmail address').fill('ecoleman@terpmail.umd.edu');
  await page.getByRole('button', { name: 'Send code' }).click();
  await expect(page.getByText('Enter your code').first()).toBeVisible();
  await page.getByLabel('6-digit code').last().fill('111111');
  await page.getByRole('button', { name: 'Verify and continue' }).click();
  await expect(page.getByText("That code doesn't match")).toBeVisible();
  await page.getByLabel('6-digit code').last().fill('123456');
  await page.getByRole('button', { name: 'Verify and continue' }).click();
  await expect(page).toHaveURL(/\/apply\/basic-info/);

  // step 1: errors first, then fill everything in
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.locator('.es[role=alert]')).toContainText(/Check these \d+ fields/);
  await page.getByLabel('Full name').fill('Ebony Coleman');
  await page.getByLabel('Phone number').fill('3015550148');
  await page.getByRole('button', { name: 'Female' }).click();
  await page.getByLabel('Race').selectOption('Asian');
  await page.getByLabel('How did you hear about this scholarship?').selectOption({ index: 1 });
  await page.getByRole('button', { name: 'Junior' }).click();
  await page.getByLabel('Credits left to finish your degree').fill('48');
  await page.getByLabel('Major').selectOption('Mechanical Engineering');
  await page.getByRole('button', { name: 'Continue' }).click();

  // step 2
  await expect(page).toHaveURL(/\/apply\/scholarship/);
  await page.getByRole('checkbox', { name: /Certification program/ }).click();
  await page.getByRole('button', { name: 'Continue' }).click();

  // step 3: over the limit blocks Continue, a short essay passes
  await expect(page).toHaveURL(/\/apply\/essay/);
  await page.getByLabel('Your essay').fill(Array(520).fill('word').join(' '));
  await expect(page.getByText('Shorten your essay by 20 words')).toBeVisible();
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page).toHaveURL(/\/apply\/essay/);
  await page.getByLabel('Your essay').fill('A short essay about a ramp.');
  await page.getByRole('button', { name: 'Continue' }).click();

  // step 4: both documents are required
  await expect(page).toHaveURL(/\/apply\/documents/);
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByText('Upload your resume to continue.').first()).toBeVisible();
  await page.getByLabel('Choose a PDF for Resume').setInputFiles(pdf);
  await page.getByLabel('Choose a PDF for Unofficial transcript').setInputFiles(pdf);
  await expect(page.getByText('Uploaded', { exact: true })).toHaveCount(2, { timeout: 10_000 });
  await page.getByRole('button', { name: 'Continue' }).click();

  // step 5: the agreement is required, then submit
  await expect(page).toHaveURL(/\/apply\/review/);
  await page.getByRole('checkbox', { name: /My answers are true/ }).click();
  await page.getByRole('checkbox', { name: /My answers are true/ }).click();
  await page.getByRole('button', { name: 'Submit application' }).click();
  await expect(page.getByText('Check the box to confirm')).toBeVisible();
  await page.getByRole('checkbox', { name: /My answers are true/ }).click();
  await page.getByRole('button', { name: 'Submit application' }).click();

  await expect(page).toHaveURL(/\/status/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Application submitted.');
});

test('the landing shows the before-open and closed variants and the email-me confirmation', async ({ page }) => {
  await page.goto('/?preview=soon');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Opens');
  await page.getByLabel('Email me when applications open').fill('visitor@example.com');
  await page.getByRole('button', { name: 'Email me' }).click();
  await expect(page.getByRole('status')).toContainText("You're on the list");
  await page.goto('/?preview=closed');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Closed for');
});

test('a load failure shows the shared error block', async ({ page }) => {
  await page.goto('/?preview=error');
  await expect(page.locator('.es[role=alert]')).toContainText("This page didn't load.");
  await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();
});
