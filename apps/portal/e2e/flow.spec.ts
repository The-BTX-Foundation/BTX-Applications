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

  // step 3: all three answers are required, over the limit blocks Continue, three short answers pass
  await expect(page).toHaveURL(/\/apply\/short-answers/);
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByText('Answer this question to continue.')).toHaveCount(3);
  await expect(page).toHaveURL(/\/apply\/short-answers/);
  const q1 = page.getByLabel(/community you're part of/);
  const q2 = page.getByLabel(/class that pushed you/);
  const q3 = page.getByLabel(/problem do you want to work on/);
  await expect(q1).toBeFocused();
  await q1.fill(Array(420).fill('word').join(' '));
  await expect(page.getByText('Shorten this answer by 20 words to continue.')).toBeVisible();
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page).toHaveURL(/\/apply\/short-answers/);
  await q1.fill('I rebuilt the ramp at my church with my uncle.');
  await q2.fill('Thermodynamics. I started drawing the system first.');
  await q3.fill('Accessible public buildings. I survey one a month.');
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

// Step 3 blocks pasting and dropping text (students type their own answers); typing still works and clears the notice.
test('pasting into a short-answer box is turned off', async ({ page }) => {
  await page.goto('/apply/short-answers');
  await expect(page.getByText('Pasting is turned off, so type them here.')).toBeVisible();
  const box = page.locator('#answer-1');
  await box.focus();
  // a real paste event with text on the clipboard: cancelled, the box stays empty, the notice shows
  const pasted = await page.evaluate(() => {
    const dt = new DataTransfer();
    dt.setData('text/plain', 'Text written somewhere else.');
    const el = document.getElementById('answer-1')!;
    return el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  });
  expect(pasted).toBe(false);
  await expect(box).toHaveValue('');
  await expect(page.locator('#answer-1-notice')).toHaveText('Pasting is turned off. Type your answer here.');
  await expect(box).toHaveAttribute('aria-describedby', /answer-1-notice/);
  await expect(box).toHaveAttribute('writingsuggestions', 'false');
  await expect(box).toHaveAttribute('data-gramm', 'false');
  // a paste that arrives as an input event is cancelled too
  const viaInput = await page.evaluate(() =>
    document.getElementById('answer-1')!.dispatchEvent(new InputEvent('beforeinput', { inputType: 'insertFromPaste', data: 'x', bubbles: true, cancelable: true })),
  );
  expect(viaInput).toBe(false);
  // plain typing is not blocked
  const typed = await page.evaluate(() =>
    document.getElementById('answer-1')!.dispatchEvent(new InputEvent('beforeinput', { inputType: 'insertText', data: 'x', bubbles: true, cancelable: true })),
  );
  expect(typed).toBe(true);
  await box.pressSequentially('I typed this myself');
  await expect(box).toHaveValue('I typed this myself');
  await expect(page.locator('#answer-1-notice')).toHaveText('');
  await expect(page.getByText('4 of 400 words')).toBeVisible();
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

test('the account menu opens on laptop and phone, closes on Escape, and signs out', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/status');
  await expect(page.locator('header.hd a.brand')).toHaveAttribute('href', 'https://thebtxfoundation.org');
  const acct = page.getByRole('button', { name: /^Account:/ });
  await acct.click();
  await expect(acct).toHaveAttribute('aria-expanded', 'true');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('link', { name: 'Sign out' })).toHaveCount(0);

  await page.setViewportSize({ width: 390, height: 844 });
  const menu = page.getByRole('button', { name: 'Menu' });
  await menu.click();
  await expect(page.getByRole('link', { name: 'Help: email us' })).toHaveAttribute('href', /^mailto:/);
  await page.getByRole('link', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/$/);
});
