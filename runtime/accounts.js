'use strict';
const dns=require('dns').promises;
const {ImapFlow}=require('imapflow');
const store=require('./store');
const models=require('./models');
const {safeAccount}=require('./settings');
const {transport,accountReady,classify}=require('./delivery');
const {decrypt,isEncrypted}=require('../cryptoUtils');
const {resolvePublic}=require('./network');
const {bounded}=require('./verification');
const protection=require('./protection');
async function txt(name,prefix){try{const rows=await bounded(dns.resolveTxt(name),5000);const values=rows.map(r=>r.join('')).filter(r=>r.startsWith(prefix));return {pass:values.length===1,record:values[0]||null,warning:values.length===1?null:'Expected one '+prefix+' record'};}catch{return {pass:false,warning:'DNS lookup unavailable or record missing'};}}
function connectionFailure(error){const auth=error?.authenticationFailed||error?.code==='EAUTH'||error?.responseCode===535;return {status:'fail',latencyMs:0,error:auth?'Authentication rejected; check active provider service and app password':'Connection failed; check provider, TLS and connectivity',category:auth?'auth':'connection',code:auth?'EAUTH':null,responseCode:error?.responseCode===535?535:null};}
function applyReport(account,report,now=Date.now()){
 const current=store.read('settings').accounts.find(a=>String(a.id)===String(account.id));if(!current||['email','password','smtpHost','smtpPort','imapHost','imapPort','dkimSelector'].some(k=>current[k]!==account[k]))return {...report,stale:true};
 const pass=report.smtp.status==='pass'&&report.imap.status==='pass';
 const dnsPass=['spf','dmarc','dkim','mx'].every(k=>report.dns?.[k]?.pass);
 const auth=report.smtp.category==='auth'||report.imap.category==='auth';const authFailures=auth?(models.campaignDb.getAccountState(account.id).authCheckFailures||0)+1:0;
 report.healthScore=[report.smtp.status==='pass',report.imap.status==='pass',report.dns?.spf?.pass,report.dns?.dmarc?.pass,report.dns?.dkim?.pass].filter(Boolean).length*20;
 report.healthStatus=pass&&dnsPass?'healthy':'warning';
 report.details=['Connection and DNS presence checks do not measure inbox placement or all spam complaints.'];
 models.campaignDb.updateAccountState(account.id,{lastDiagnosticAt:now,lastSmtpStatus:report.smtp.status,lastImapStatus:report.imap.status,lastSmtpLatencyMs:report.smtp.latencyMs,lastImapLatencyMs:report.imap.latencyMs,lastSmtpErrorCode:report.smtp.code||null,lastSmtpResponseCode:report.smtp.responseCode||null,lastImapErrorCode:report.imap.code||null,dnsResult:report.dns,healthScore:report.healthScore,healthStatus:report.healthStatus,authCheckFailures:authFailures,nextHealthCheckAt:now+(auth?Math.min(86400000,3600000*Math.pow(2,Math.min(5,authFailures-1))):!pass?300000:900000)});
 if(!pass||!dnsPass)protection.hold(account.id,auth?'auth':!pass?'connection':'dns',auth?'Mailbox authentication rejected; verify provider service and app credentials':!pass?'Mailbox connection check failed':'Required DNS checks are incomplete or failing',{cooldown:auth?3600000:1800000,now,extend:true});
 protection.evaluate(account.id,{diagnosticCompleted:true,now});
 store.record('account_diagnostic',{accountId:account.id,smtp:report.smtp.status,imap:report.imap.status,dns:report.dns?.overall||'warning'});
 return report;
}
async function diagnostics(account){
 const report={accountId:String(account.id),email:account.email,timestamp:Date.now(),smtp:{status:'fail',latencyMs:0,error:null},imap:{status:'fail',latencyMs:0,error:null},dns:null};
 let client;let start=Date.now();
 try{await resolvePublic(account.smtpHost);client=transport(account);await client.verify();report.smtp={status:'pass',latencyMs:Date.now()-start,error:null};}catch(e){report.smtp=connectionFailure(e);}finally{client?.close();}
 let imap;start=Date.now();
 try{await resolvePublic(account.imapHost);const pass=account.password||account.pass;imap=new ImapFlow({host:account.imapHost,port:Number(account.imapPort),secure:Number(account.imapPort)===993,doSTARTTLS:Number(account.imapPort)!==993,auth:{user:account.email,pass:isEncrypted(pass)?decrypt(pass):pass},logger:false,connectionTimeout:8000,greetingTimeout:8000,socketTimeout:10000});imap.on('error',()=>{});await imap.connect();const lock=await imap.getMailboxLock('INBOX');lock.release();report.imap={status:'pass',latencyMs:Date.now()-start,error:null};}catch(e){report.imap=connectionFailure(e);}finally{imap?.close();}
 const domain=account.email.split('@')[1];
 const [spf,dmarc,dkim,mx]=await Promise.all([txt(domain,'v=spf1'),txt('_dmarc.'+domain,'v=DMARC1'),account.dkimSelector?txt(account.dkimSelector+'._domainkey.'+domain,'v=DKIM1'):Promise.resolve({pass:false,warning:'Set the provider DKIM selector before checking'}),bounded(dns.resolveMx(domain),5000).then(r=>({pass:r.some(x=>x.exchange&&x.exchange!=='.')})).catch(()=>({pass:false}))]);
 report.dns={spf,dmarc,dkim,mx,overall:[spf,dmarc,dkim,mx].every(r=>r.pass)?'good':'warning',summary:'DNS record presence only. Confirm provider authorization and alignment in received test-message headers.'};
 return applyReport(account,report);
}
function list(){const c=store.read('campaign');return (store.read('settings').accounts||[]).map(a=>{const st=c.accountState[String(a.id)]||{};const stats=models.accountStats(a.id);const telemetry=Object.fromEntries(['autoPaused','autoPauseReason','lastDiagnosticAt','lastSmtpStatus','lastImapStatus','lastSmtpLatencyMs','lastImapLatencyMs','dnsResult','healthStatus','consecutiveErrors','lastError','lastErrorAt','lastErrorType','protectionKind','requiresReview','manualHold','pauseUntil','recoveryChecks','recoveryStartedAt','nextHealthCheckAt','lastSmtpErrorCode','lastSmtpResponseCode','lastImapErrorCode'].filter(k=>k in st).map(k=>[k,st[k]]));const ready=accountReady(a);return {...safeAccount(a),...stats,...telemetry,healthWindow:protection.windowStats(a.id),effectiveDailyCap:protection.dailyCap(a,store.read('settings')),healthScore:ready.safe?'good':st.autoPaused?'critical':'warning',healthScoreNumber:st.healthScore??null,healthStatus:st.lastDiagnosticAt?(st.autoPaused?'paused':st.healthStatus||'warning'):'warning',diagnosticState:st.lastDiagnosticAt?'checked':'unknown',readinessReason:ready.reason||null};});}
function pause(id,reason){if(!(store.read('settings').accounts||[]).some(a=>String(a.id)===String(id)))throw new Error('Account not found');models.campaignDb.updateAccountState(id,{autoPaused:true,manualHold:true,autoPauseReason:String(reason||'Paused by operator').slice(0,500),pausedAt:Date.now()});store.record('account_operator_pause',{accountId:id});}
function resume(id,reason){return store.transaction(()=>{const a=store.read('settings').accounts.find(a=>String(a.id)===String(id));if(!a)throw new Error('Account not found');const st=models.campaignDb.getAccountState(id);if(!protection.diagnosticsPass(st))throw new Error('Run successful SMTP, IMAP and DNS diagnostics before resuming');if(protection.risk(id))throw new Error('Recent delivery warning signals still block this mailbox');if(st.pauseUntil>Date.now())throw new Error('Recovery cooldown has not finished');if(st.requiresReview&&(typeof reason!=='string'||reason.trim().length<10))throw new Error('Explain how the provider or reputation warning was resolved');models.campaignDb.updateAccountState(id,{autoPaused:false,manualHold:false,requiresReview:false,autoPauseReason:null,protectionKind:null,consecutiveErrors:0,...(st.protectionKind?{recoveryStartedAt:Date.now(),recoveryCap:10}:{})});store.record('account_operator_resume',{accountId:id,reason:typeof reason==='string'?reason.slice(0,1000):null});});}
module.exports={diagnostics,applyReport,list,pause,resume,classifyError:classify,isAccountHealthy:id=>{const a=store.read('settings').accounts.find(a=>String(a.id)===String(id));return a?accountReady(a):{safe:false,reason:'Account missing'};}};
