'use strict';
const store=require('./store');
function readyAt(id){return store.read('campaign').accountState[String(id)]?.nextSendAt||0;}
function interval(settings,random=Math.random){const min=Math.max(1000,settings.delayMinMs),max=Math.max(min,settings.delayMaxMs);return Math.round(min+Math.max(0,Math.min(1,random()))*(max-min));}
function reserve(id,settings,now=Date.now(),random=Math.random){const c=store.read('campaign');const st=c.accountState[String(id)]||={};if(st.nextSendAt>now)return false;st.lastReservedAt=now;st.nextSendAt=now+interval(settings,random);store.write('campaign',c);return true;}
function complete(id,settings,now=Date.now()){store.mutate('campaign',c=>{const st=c.accountState[String(id)]||={};st.nextSendAt=Math.max(st.nextSendAt||0,now+Math.max(1000,settings.delayMinMs));st.lastDispatchAt=now;});}
function sortAccounts(accounts){const states=store.read('campaign').accountState;return [...accounts].sort((a,b)=>(states[String(a.id)]?.lastReservedAt||0)-(states[String(b.id)]?.lastReservedAt||0));}
function anyDue(accounts,now=Date.now()){const states=store.read('campaign').accountState;return accounts.some(a=>!a.disabled&&!states[String(a.id)]?.autoPaused&&(states[String(a.id)]?.nextSendAt||0)<=now);}
module.exports={anyDue,readyAt,interval,reserve,complete,sortAccounts};
