'use strict';
const dns=require('dns').promises;
const mxCache=new Map();
const MX_TTL_MS=30*60*1000;
const BLOCKED_DOMAINS=new Set(['mailinator.com','yopmail.com','guerrillamail.com','tempmail.com','10minutemail.com','trashmail.com','sharklasers.com','getnada.com','maildrop.cc','temp-mail.org','throwawaymail.com','fakeinbox.com','domain.com','email.com','yourdomain.com','yoursite.com','company.com','website.com','sample.com','sentry.io','wixpress.com','sentry.wixpress.com','sentry-next.wixpress.com','godaddy.com','secureserver.net','icims.com','group.calendar.google.com']);
function cleanEmailAddress(value){
 if(typeof value!=='string')return '';
 let s=value.trim().toLowerCase().replace(/^mailto:/i,'').split('?')[0].replace(/^(?:%20|\s)+/,'').replace(/^[0-9()-.\s]{7,}/,'').replace(/^(?:email|e-mail|mail|phone|tel|call|contact|reach|us|at)[:\s-]*/i,'').replace(/@www\./,'@');
 s=s.replace(/\.(com|net|org|edu|gov|io|co|us|biz)(?:phone|tel|call|fax|email|contact|hours|monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|wed|thu|fri|sat|sun|get|read|view|more|all|inc|llc|ltd|corp|copyright|rights|reserved|[0-9]).*$/i,'.$1');
 return s.replace(/^[^a-z0-9]+|[^a-z0-9]+$/g,'');
}
function isValidSyntax(email){return typeof email==='string'&&email.length<=254&&/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,63}$/i.test(email);}
function isRoleBasedEmail(email){return /^(no-?reply|do-?not-?reply|mailer-daemon|postmaster|abuse|security|privacy|dmca|legal|compliance|webmaster|hostmaster|root|sysadmin|bounce|bounces|unsubscribe|spam|fraud|phishing|filler|devnull|null|blackhole)([.+_-].*)?@/i.test(email);}
function checkDomainBlacklist(domain){const d=String(domain||'').toLowerCase();return {blocked:BLOCKED_DOMAINS.has(d),reason:'Disposable or system mailbox domain'};}
async function bounded(promise,ms){let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Verification timed out')),ms);})]);}finally{clearTimeout(timer);}}
async function resolveMxCached(domain){
 const cached=mxCache.get(domain);
 if(cached&&Date.now()-cached.at<MX_TTL_MS)return cached.records;
 const records=await bounded(dns.resolveMx(domain),5000);
 mxCache.set(domain,{records,at:Date.now()});
 return records;
}
async function verifyEmail(value){const email=cleanEmailAddress(value);const result=(status,reason)=>({status,valid:status==='verified',cleanedEmail:email,reason,checkedAt:Date.now(),smtpChecked:false});if(!isValidSyntax(email)||isRoleBasedEmail(email))return result('invalid','Invalid syntax or automated mailbox');const domain=email.split('@')[1];if(checkDomainBlacklist(domain).blocked)return result('invalid','Disposable mailbox domain');
 try{const records=await resolveMxCached(domain);if(!records?.some(r=>r.exchange&&r.exchange!=='.'))return result('invalid','Domain does not accept email');}catch(e){return result(['ENOTFOUND','ENODATA'].includes(e.code)?'invalid':'unknown','DNS could not establish mail routing; retry transient failures');}
 if(process.env.VERIFIER_API_URL){try{const url=new URL(process.env.VERIFIER_API_URL);if(url.protocol!=='https:')throw new Error('Verifier must use HTTPS');const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+(process.env.VERIFIER_API_KEY||'')},body:JSON.stringify({email}),signal:AbortSignal.timeout(12000)});if(!response.ok)throw new Error('Verification provider failed');const data=await response.json();const status={valid:'verified',invalid:'invalid','catch-all':'risky',unknown:'unknown'}[data.status]||'unknown';return {...result(status,String(data.reason||'External mailbox verification').slice(0,300)),provider:url.hostname};}catch{return result('unknown','Mailbox verification provider unavailable; retry later');}}
 return result('unknown','Mail routing exists; mailbox ownership/deliverability has not been verified. Configure an external verifier or record external verification evidence.');}
module.exports={verifyEmail,cleanEmailAddress,isValidSyntax,isRoleBasedEmail,checkDomainBlacklist,bounded};
