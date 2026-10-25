'use strict';
require('../runtime/bootstrap').ensure();
const store=require('../runtime/store'),leads=require('../runtime/leads');
const limitArg=process.argv.find(a=>a.startsWith('--limit='));const limit=Number(limitArg?limitArg.split('=')[1]:10);
if(!Number.isInteger(limit)||limit<1||limit>100)throw new Error('Use --limit=1 through --limit=100; originals remain read only');
const pending=Object.values(store.read('leads').businesses).filter(b=>leads.researchDue(b)).slice(0,limit);
let cursor=0,completed=0,unavailable=0;
Promise.all(Array.from({length:2},async()=>{while(cursor<pending.length){const b=pending[cursor++];try{const out=await leads.researchLead(b.id);if(out.research.pages.length)completed++;else unavailable++;}catch{unavailable++;}console.log(JSON.stringify({processed:completed+unavailable,total:pending.length,researched:completed,unavailable}));}})).then(()=>{console.log('Public research saved only to the working database. No contacts were approved or emailed.');store.close();}).catch(()=>{console.error('Research stopped; already saved working records are retained.');process.exitCode=1;});
