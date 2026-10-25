'use strict';
const crypto=require('crypto');
const store=require('./store');
const protection=require('./protection');

async function run({diagnostics=require('./accounts').diagnostics, now=Date.now()}={}) {
  const owner=crypto.randomUUID();
  if(!store.lease('account-monitor',owner,120000))return {busy:true};
  const beat=()=>{if(!store.lease('account-monitor',owner,120000))throw new Error('Monitor lease lost');store.write('protectionMonitor',{status:'online',heartbeatAt:Date.now(),lastCycleAt:now});};
  beat();
  const heartbeat=setInterval(()=>{try{beat();}catch{/* Another monitor will take over after expiry. */}},10000);
  let checked=0,failed=0;
  try {
    for(const account of store.read('settings').accounts||[]){
      if(account.disabled)continue;
      beat();
      protection.evaluate(account.id,{now});
      const st=store.read('campaign').accountState[String(account.id)]||{};
      if(st.nextHealthCheckAt>now)continue;
      try {const report=await diagnostics(account);checked++;if(report&&!report.stale&&(report.smtp?.status!=='pass'||report.imap?.status!=='pass'||!['spf','dmarc','dkim','mx'].every(k=>report.dns?.[k]?.pass)))failed++;}
      catch {failed++;protection.hold(account.id,'connection','Unable to complete mailbox diagnostics',{now});}
    }
    store.write('protectionMonitor',{status:'online',heartbeatAt:Date.now(),lastCycleAt:now,lastCompletedAt:Date.now(),checked,failed});
    return {checked,failed};
  } finally {clearInterval(heartbeat);store.release('account-monitor',owner);}
}

function start(){
  let stopped=false,running=false;
  const tick=async()=>{if(stopped||running)return;running=true;try{await run();}catch{store.record('account_monitor_error',{});}finally{running=false;}};
  const timer=setInterval(()=>void tick(),60000);
  void tick();
  return ()=>{stopped=true;clearInterval(timer);};
}
module.exports={run,start};
