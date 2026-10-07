import {test,expect}from'@playwright/test';
async function login(page,email='admin@example.test') {await page.goto('/admin.html');await page.locator('#email').fill(email);await page.locator('#password').fill('fixture-password');await page.locator('#login button').click();}
async function submit(request){return request.post('/rest/v1/rpc/submit_mailbox_entry',{data:{entry_id:crypto.randomUUID(),payload:{outcome:'rejection',days:null,segments:[{type:'text',text:'Hi Alex, unfortunately Acme cannot proceed. SecretPhrase.'}]}}});}
test.beforeEach(async({request})=>{await request.get('/__test/reset');});
test('private login, redact preview, approve copy and reject removes it publicly',async({page,request})=>{
 await submit(request);await page.goto('/admin.html');await expect(page.locator('#workspace')).toBeHidden();
 await login(page,'other@example.test');await expect(page.locator('#admin-error')).toContainText('does not have');await expect(page.locator('#incoming')).toBeEmpty();
 await login(page);await expect(page.locator('#queue button')).toHaveCount(1);await page.locator('#queue button').click();await expect(page.locator('#incoming')).toContainText('Alex');
 await page.locator('#extra').fill('Acme\nSecretPhrase');await page.locator('#prepare').click();await expect(page.locator('#public-preview')).toBeVisible();await expect(page.locator('#processed')).not.toContainText('Alex');await expect(page.locator('#processed')).not.toContainText('Acme');
 await page.locator('#extra').fill('Acme\nSecretPhrase.');await expect(page.locator('#public-preview')).toBeHidden();await page.locator('#prepare').click();
 await page.screenshot({path:'test-results/admin-desktop.png',fullPage:true});await page.locator('#approve').click();await expect(page.locator('#queue button')).toHaveCount(0);
 const rows=await(await request.post('/rest/v1/rpc/mailbox_collection',{data:{}})).json();expect(rows).toHaveLength(1);expect(JSON.stringify(rows)).not.toMatch(/Alex|Acme|SecretPhrase/);
 await page.locator('#filter').selectOption('approved');await page.locator('#queue button').click();await page.locator('#reject').click();await page.locator('#reject-yes').click();await expect(page.locator('#queue button')).toHaveCount(0);
 expect(await(await request.post('/rest/v1/rpc/mailbox_collection',{data:{}})).json()).toEqual([]);
 await page.locator('#logout').click();await expect(page.locator('#workspace')).toBeHidden();await expect(page.locator('#incoming')).toBeEmpty();expect(await page.evaluate(()=>[localStorage.length,sessionStorage.length])).toEqual([0,0]);
});
test('mobile moderation empty state and failed login',async({page})=>{
 await page.setViewportSize({width:390,height:844});await page.goto('/admin.html');await page.locator('#email').fill('admin@example.test');await page.locator('#password').fill('wrong');await page.locator('#login button').click();await expect(page.locator('#admin-error')).toContainText('Could not sign in');
 await login(page);await expect(page.locator('#notice')).toHaveText('No submissions here.');expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:'test-results/admin-mobile.png',fullPage:true});
});
