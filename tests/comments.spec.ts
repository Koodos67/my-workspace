import { test, expect, type BrowserContext } from '@playwright/test';
import { readFileSync, existsSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { randomUUID, createHmac } from 'node:crypto';
import { Pool } from 'pg';

const local = parseEnv(readFileSync('.env.local', 'utf8'));
const base = process.env.TEST_BASE_URL || 'http://localhost:3198';
if (new URL(base).hostname !== 'localhost') throw new Error('Local tests only');
if (existsSync('.env.production.local') && new URL(parseEnv(readFileSync('.env.production.local','utf8')).DATABASE_URL!).hostname === new URL(local.DATABASE_URL!).hostname) throw new Error('Refusing production database');
const pool = new Pool({ connectionString: local.DATABASE_URL!.replace('sslmode=require','sslmode=verify-full') });
// 0 admin, 1 client member, 2 second client member, 3 stranger.
const users = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
const slug = 'comments-' + randomUUID();
let clientId: string, itemId: string, draftId: string;

async function login(context: BrowserContext, index: number) {
  const token = randomUUID();
  await pool.query('INSERT INTO public."session"(id,token,"userId","expiresAt","createdAt","updatedAt") VALUES($1,$2,$3,now()+interval \'1 hour\',now(),now())', [randomUUID(), token, users[index]]);
  const value = encodeURIComponent(token + '.' + createHmac('sha256', local.BETTER_AUTH_SECRET!).update(token).digest('base64'));
  await context.addCookies([{ name: 'better-auth.session_token', value, domain: 'localhost', path: '/', httpOnly: true, secure: false, sameSite: 'Lax' }]);
}

test.beforeAll(async () => {
  const names = ['Comments Admin', 'Alex Client', 'Sam Client', 'Nosy Stranger'];
  for (const [index, id] of users.entries()) await pool.query('INSERT INTO public."user"(id,name,email,"emailVerified","createdAt","updatedAt") VALUES($1,$2,$3,true,now(),now())', [id, names[index], id + '@example.invalid']);
  await pool.query("UPDATE profiles SET role='admin' WHERE id=$1", [users[0]]);
});
test.afterAll(async () => {
  if (clientId) {
    await pool.query('DELETE FROM comments WHERE item_id IN (SELECT id FROM items WHERE client_id=$1)', [clientId]);
    await pool.query('DELETE FROM approval_requests WHERE client_id=$1', [clientId]);
    await pool.query('UPDATE items SET current_version_id=NULL WHERE client_id=$1', [clientId]);
    await pool.query('DELETE FROM item_versions WHERE item_id IN (SELECT id FROM items WHERE client_id=$1)', [clientId]);
    for (const table of ['events','memberships','items','folders','tracks','projects']) await pool.query(`DELETE FROM ${table} WHERE client_id=$1`, [clientId]);
    await pool.query('DELETE FROM clients WHERE id=$1', [clientId]);
  }
  await pool.query('DELETE FROM profiles WHERE id=ANY($1::text[])', [users]);
  await pool.query('DELETE FROM public."user" WHERE id=ANY($1::text[])', [users]);
  await pool.end();
});

test('clients and KOODOS hold a conversation on a deliverable, and only where it is shared', async ({ page, context, browser }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await login(context, 0);
  await page.goto('/admin');
  await page.getByLabel('Company name').fill('Comments QA');
  await page.getByLabel('Workspace slug').fill(slug);
  await page.getByRole('button', { name: 'Create client' }).click();
  await expect(page).toHaveURL(/\/admin\/clients\//);
  clientId = page.url().split('/').pop()!.split('?')[0];
  const projectId = (await pool.query('SELECT id FROM projects WHERE client_id=$1', [clientId])).rows[0].id;
  for (const id of [users[1], users[2]]) await pool.query('INSERT INTO memberships(client_id,profile_id) VALUES($1,$2)', [clientId, id]);
  itemId = (await pool.query("INSERT INTO items(client_id,project_id,type,title,url,published_at) VALUES($1,$2,'link','Shared proposal','https://example.com',now()) RETURNING id", [clientId, projectId])).rows[0].id;
  draftId = (await pool.query("INSERT INTO items(client_id,project_id,type,title,url) VALUES($1,$2,'link','Unshared draft','https://example.com') RETURNING id", [clientId, projectId])).rows[0].id;

  // A draft is not a conversation: nobody can comment until it is shared with the client.
  await page.goto('/items/' + draftId);
  await expect(page.getByText('Comments open once this item is shared with the client')).toBeVisible();
  await expect(page.locator('.comment-composer')).toHaveCount(0);

  // The client starts the conversation.
  const memberContext = await browser.newContext();
  await login(memberContext, 1);
  const member = await memberContext.newPage();
  member.on('pageerror', error => errors.push(error.message));
  await member.goto('/items/' + itemId);
  await member.getByLabel('Start the conversation').fill('Could we see a version with the pricing table removed?');
  await member.getByRole('button', { name: 'Post comment' }).click();
  const first = member.locator('.comment').first();
  await expect(first).toContainText('Could we see a version with the pricing table removed?');
  await expect(first).toContainText('Client');
  // The box must empty, or a posted comment looks unsent.
  await expect(member.getByLabel('Add to the conversation')).toHaveValue('');

  // A second member of the same client sees who wrote it, though they cannot read that profile.
  const secondContext = await browser.newContext();
  await login(secondContext, 2);
  const second = await secondContext.newPage();
  await second.goto('/items/' + itemId);
  await expect(second.locator('.comment').first()).toContainText('Alex Client');

  // A stranger sees neither the item nor the thread.
  const strangerContext = await browser.newContext();
  await login(strangerContext, 3);
  const stranger = await strangerContext.newPage();
  await stranger.goto('/items/' + itemId);
  await expect(stranger.locator('.comment')).toHaveCount(0);
  await expect(stranger.getByText('Could we see a version')).toHaveCount(0);

  // The admin is told there is a reply waiting, from the client list, and answers.
  await page.goto('/admin/clients/' + clientId);
  await expect(page.locator('.comment-flag.is-client').first()).toContainText('client replied');
  await page.goto('/items/' + itemId);
  await expect(page.locator('.comment')).toHaveCount(1);
  await page.getByLabel('Add to the conversation').fill('Yes — new version with pricing removed goes up tomorrow.');
  await page.getByRole('button', { name: 'Post comment' }).click();
  await expect(page.locator('.comment')).toHaveCount(2);
  await expect(page.locator('.comment').nth(1)).toContainText('KOODOS');
  await page.screenshot({ path: '.shipstudio/comments-admin-desktop.png', fullPage: true });

  // Authors edit their own words; an admin cannot rewrite a client's.
  await member.reload();
  await expect(member.locator('.comment')).toHaveCount(2);
  await member.locator('.comment').first().getByText('Edit', { exact: true }).click();
  await member.getByLabel('Edit your comment').fill('Could we see a version with the pricing table removed, please?');
  await member.getByRole('button', { name: 'Save comment' }).click();
  await expect(member.locator('.comment').first()).toContainText('please?');
  await expect(member.locator('.comment').first()).toContainText('edited');
  await expect(member.locator('.comment').nth(1).getByText('Edit', { exact: true })).toHaveCount(0);
  // The edit rewrites the row rather than adding one, and stamps edited_at.
  const stored = (await pool.query('SELECT body,edited_at,author_name,author_role FROM comments WHERE item_id=$1 ORDER BY created_at', [itemId])).rows;
  expect(stored).toHaveLength(2);
  expect(stored[0].body).toContain('please?');
  expect(stored[0].edited_at).not.toBeNull();
  expect(stored[0].author_name).toBe('Alex Client');
  expect(stored[1].author_role).toBe('admin');
  // The hydration guard must release, or the composer is dead on arrival.
  await expect(member.getByRole('button', { name: 'Post comment' })).toBeEnabled();
  await member.screenshot({ path: '.shipstudio/comments-client-desktop.png', fullPage: true });
  await member.setViewportSize({ width: 390, height: 844 });
  await member.screenshot({ path: '.shipstudio/comments-client-mobile.png', fullPage: true });
  expect(await member.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  await member.setViewportSize({ width: 1280, height: 900 });

  // Removal is a withdrawal, not an erasure: gone for the client, on the record for KOODOS.
  member.on('dialog', dialog => dialog.accept());
  await member.locator('.comment').first().getByRole('button', { name: 'Remove' }).click();
  await expect(member.locator('.comment')).toHaveCount(1);
  await expect(member.getByText('pricing table removed, please?')).toHaveCount(0);
  await page.reload();
  await expect(page.locator('.comment')).toHaveCount(2);
  await expect(page.locator('.comment[data-removed]')).toContainText('shown to KOODOS only');

  // Archiving the project closes the conversation without destroying it.
  await pool.query('UPDATE projects SET archived_at=now() WHERE id=$1', [projectId]);
  await member.reload();
  await expect(member.locator('.comment-composer')).toHaveCount(0);
  await pool.query('UPDATE projects SET archived_at=NULL WHERE id=$1', [projectId]);

  // Revoked members lose the thread with the workspace.
  await pool.query('DELETE FROM memberships WHERE client_id=$1 AND profile_id=$2', [clientId, users[1]]);
  await member.reload();
  await expect(member.locator('.comment')).toHaveCount(0);

  expect(errors).toEqual([]);
  await memberContext.close(); await secondContext.close(); await strangerContext.close();
});
