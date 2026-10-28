'use strict';
require('../runtime/bootstrap').ensure();
const store=require('../runtime/store');
(async()=>{
 const launch=require('../runtime/launch').report();const preflight=require('../runtime/analytics').preflight();const settings=store.read('settings');
 const endpoint={configured:launch.publicHttpsConfigured,reachable:false,reason:'Public HTTPS URL is missing'};
 if(endpoint.configured){try{
  const token=require('../runtime/auth').publicToken('unsubscribe',{email:'launch-check@example.invalid'});
  const result=await require('../runtime/network').safeFetchText(process.env.DASHBOARD_URL.replace(/\/$/,'')+'/api/unsubscribe/one-click?token='+encodeURIComponent(token));
  endpoint.reachable=/Stop future outreach/.test(result.text)&&/<form\b/i.test(result.text)&&/method=["']post["']/i.test(result.text);
  endpoint.reason=endpoint.reachable?'Signed confirmation page reachable; still test POST using an owned recipient':'Public URL did not return the expected signed unsubscribe page';
 }catch{endpoint.reason='Public unsubscribe endpoint is unreachable or rejected the signed link';}}
 const blockers=[...preflight.validation.errors];if(!endpoint.reachable)blockers.push(endpoint.reason);if(!launch.monitorCurrent)blockers.push('Account protection monitor has no current heartbeat');if(!launch.liveEmailEnabled)blockers.push('Live sending is disabled; enable only after the owned-recipient pilot');
 const result={checkedAt:new Date().toISOString(),readyToSend:blockers.length===0,campaign:store.read('state').status,limits:{perAccount:settings.maxEmailsPerDay,total:settings.maxDailyTotal,externalWarmupCounted:false},mailboxes:{configured:launch.accounts.length,ready:launch.accounts.filter(a=>a.ready).length,pilotPassed:launch.accounts.filter(a=>a.pilotPassed).length},eligibleContacts:preflight.simulation.mailableLeads,identityConfigured:launch.identityConfigured,monitorCurrent:launch.monitorCurrent,publicUnsubscribe:endpoint,blockers};
 console.log(JSON.stringify(result,null,2));store.close();process.exitCode=result.readyToSend?0:2;
})().catch(()=>{console.error('Launch check failed; no email was sent.');store.close();process.exitCode=1;});
