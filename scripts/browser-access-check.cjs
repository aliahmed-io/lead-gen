'use strict';
const assert=require('assert/strict');
async function enterWorkspace(context,page,checks,{localOnly,base}){
 if(localOnly){
  assert.equal((await context.request.get('/api/settings')).status(),200);
  assert.equal((await context.request.get('/api/accounts')).status(),200);
  assert.equal((await context.request.post('/api/accounts/import',{data:{accounts:[]}})).status(),403);
  for(const headers of [{Host:'attacker.invalid'},{Origin:'https://attacker.invalid'},{'X-Forwarded-For':'198.51.100.8'},{'X-Forwarded-Host':'public.example'},{'Sec-Fetch-Site':'cross-site'}])assert.equal((await context.request.get('/api/settings',{headers})).status(),403,JSON.stringify(headers));
  const session=await (await context.request.get('/api/auth/session')).json();
  assert.deepEqual(session,{authenticated:true,localOnly:true});
  assert.equal((await context.cookies()).some(c=>c.name==='leadgen_session'),false);
  await page.goto('/login');await page.waitForURL(base+'/');await page.waitForLoadState('networkidle');
  assert.equal(await page.getByLabel('Administrator password').count(),0);
  assert.equal(await page.getByRole('button',{name:'Sign out',exact:true}).count(),0);
  await page.goto('/leads');
  checks.push('Local dashboard opens without credentials, cookies, login or sign-out');
  checks.push('Local API rejects external hosts, forwarding and cross-site requests');
 }else{
  assert.equal((await context.request.get('/api/settings')).status(),401);
  assert.equal((await context.request.get('/api/accounts/dns?email=sender@example.com')).status(),401);
  assert.equal((await context.request.post('/api/accounts/import',{data:{accounts:[]}})).status(),401);
  checks.push('Unauthenticated admin API blocked, including legacy account routes');
  await page.goto('/leads');await page.waitForURL('**/login?next=*');
  await page.getByLabel('Administrator password').fill(process.env.ADMIN_PASSWORD);
  const response=page.waitForResponse(r=>r.url().includes('/api/auth/login'));
  await page.getByRole('button',{name:'Sign in',exact:true}).click();
  const result=await response;if(result.status()!==200)throw new Error('Login failed: '+await result.text());
  await page.waitForURL('**/leads*');checks.push('Sign-in and protected navigation');
 }
 await page.getByRole('heading',{name:'Leads database',exact:true}).waitFor();
 await page.waitForLoadState('networkidle');
}
async function checkPublicToken(anonymous,token,checks,localOnly){
 if(localOnly){
  assert.equal((await anonymous.request.get('/api/settings',{headers:{Cookie:'leadgen_session='+token,Origin:'https://attacker.invalid'}})).status(),403);
  checks.push('Public opt-out token cannot bypass local origin restrictions');
 }else{
  assert.equal((await anonymous.request.get('/api/settings',{headers:{Cookie:'leadgen_session='+token}})).status(),401);
  checks.push('Signed public opt-out cannot authorize admin access');
 }
}
module.exports={enterWorkspace,checkPublicToken};
