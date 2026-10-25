'use strict';
const store=require('./store');
function blockedError(reason){const current=store.read('scraperJob',{});store.write('scraperJob',{...current,status:'blocked',blockedReason:reason,finishedAt:Date.now()});store.record('scraper_blocked',{reason});return Object.assign(new Error(reason),{code:'SCRAPER_BLOCKED'});}
module.exports={blockedError};
