'use strict';
async function launch(options={},engine=require('playwright').chromium){
 const args=(options.args||[]).filter(a=>!['--no-sandbox','--disable-setuid-sandbox'].includes(a));
 const selected=process.env.PLAYWRIGHT_CHANNEL;
 if(selected&&!['msedge','chrome','chromium'].includes(selected))throw new Error('PLAYWRIGHT_CHANNEL must be msedge, chrome or chromium');
 for(const channel of selected?[selected]:['chromium','msedge','chrome']){
  try{return await engine.launch({...options,args,...(channel==='chromium'?{}:{channel})});}catch{/* Try another installed browser; no automatic download or credential use. */}
 }
 throw new Error('No supported browser found. Install Playwright Chromium or use installed Edge/Chrome. Static research can still run.');
}
module.exports={launch};
