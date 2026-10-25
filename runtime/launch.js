'use strict';
const crypto=require('crypto');
const store=require('./store');
const {sourceUrl}=require('./targeting');
const TTL=30*86400000;
function fingerprint(account){return crypto.createHash('sha256').update(JSON.stringify(['id','email','password','smtpHost','smtpPort','imapHost','imapPort','dkimSelector'].map(k=>account[k]||''))).digest('hex');}
function pilotReady(account,now=Date.now()){
 const e=store.read('launchEvidence',{})[String(account.id)];
 return Boolean(e&&e.fingerprint===fingerprint(account)&&now-e.checkedAt<=TTL&&e.authenticationPassed&&e.ownedRecipients&&e.unsubscribeWorked&&e.replyThreadingWorked&&e.observedInbox);
}
function publicBase(){try{const u=new URL(process.env.DASHBOARD_URL||'');return Boolean(u.protocol==='https:'&&sourceUrl(u.href)&&!/(^|\.)(example\.(com|org|net)|localhost)$|\.example$|yourdomain|your-dashboard/i.test(u.hostname)&&!u.username&&!u.password&&!u.search&&!u.hash&&u.pathname==='/');}catch{return false;}}
function saveEvidence(input){
 const account=(store.read('settings').accounts||[]).find(a=>String(a.id)===String(input.accountId));if(!account)throw new Error('Account not found');
 if(typeof input.headers!=='string'||input.headers.length>30000||input.headers.length<50)throw new Error('Paste the received test message raw headers (up to 30 KB)');
 const unfolded=input.headers.replace(/\r?\n[ \t]+/g,' ');const auth=unfolded.split(/\r?\n/).filter(l=>/^Authentication-Results:/i.test(l)).join(' ');const from=unfolded.split(/\r?\n/).find(l=>/^From:/i.test(l))||'';const domain=account.email.split('@')[1].toLowerCase();
 if(!(from.toLowerCase().match(/[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,63}/g)||[]).includes(account.email.toLowerCase()))throw new Error('Received headers must show this exact mailbox as From');
 const fromDomain=auth.match(/header\.from\s*=\s*([^\s;]+)/i)?.[1]?.toLowerCase();const dkimDomains=[...auth.matchAll(/header\.(?:d|i)\s*=\s*([^\s;]+)/ig)].map(m=>m[1].toLowerCase().split('@').pop());
 if(!/\bspf=pass\b/i.test(auth)||!/\bdkim=pass\b/i.test(auth)||!/\bdmarc=pass\b/i.test(auth)||fromDomain!==domain||!dkimDomains.some(d=>d===domain||d.endsWith('.'+domain)))throw new Error('Recipient Authentication-Results must show SPF, aligned DKIM and DMARC passing for this sender domain');
 for(const key of ['ownedRecipients','unsubscribeWorked','replyThreadingWorked','observedInbox'])if(input[key]!==true)throw new Error('Confirm the owned-recipient delivery, inbox observation, unsubscribe and reply-threading tests');
 if(typeof input.notes!=='string'||input.notes.trim().length<20||input.notes.length>2000)throw new Error('Describe the received-message tests and results');
 if(!store.connection().prepare("SELECT 1 FROM documents WHERE name='launchEvidence'").get())store.write('launchEvidence',{});store.mutate('launchEvidence',d=>{d[String(account.id)]={accountId:account.id,checkedAt:Date.now(),fingerprint:fingerprint(account),authenticationPassed:true,ownedRecipients:true,unsubscribeWorked:true,replyThreadingWorked:true,observedInbox:true,notes:input.notes,headers:input.headers};});
 store.record('launch_pilot_evidence',{accountId:account.id,source:'Operator-attested received message; headers parsed'});
 return {success:true};
}
function report(){
 const settings=store.read('settings');let identity=false;try{require('./templates').footer({},settings);identity=true;}catch{/* Report the missing configuration below. */}
 const evidence=store.read('launchEvidence',{});const accounts=require('./accounts').list();
 const items=accounts.map(a=>{const original=settings.accounts.find(x=>String(x.id)===String(a.id));const e=evidence[String(a.id)];return {id:a.id,email:a.email,disabled:a.disabled,ready:a.healthScore==='good',reason:a.readinessReason,dkimSelector:a.dkimSelector||'',pilotPassed:pilotReady(original),pilotCheckedAt:e?.checkedAt||null,notes:e?.notes||''};});
 return {identityConfigured:identity,publicHttpsConfigured:publicBase(),monitorCurrent:!!require('./protection').monitorCurrent(),liveEmailEnabled:process.env.ENABLE_LIVE_EMAIL==='1',accounts:items,note:'Pilot evidence is operator-attested; parsing headers does not independently prove inbox placement or future delivery.'};
}
module.exports={pilotReady,publicBase,saveEvidence,report,fingerprint};
