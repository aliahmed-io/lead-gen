'use strict';
const {safeFetchText}=require('./network');
const {factsFromPage}=require('./research');
const {domain,exclusion}=require('./targeting');
async function renderResearch(browser,lead,{signal}={}){
 if(exclusion(lead))return {contacts:[],owners:[],sizeFacts:[],pages:[]};
 const base=/^https?:\/\//i.test(lead.website)?lead.website:'https://'+lead.website;
 const controller=new AbortController();const cancel=()=>controller.abort();signal?.addEventListener('abort',cancel,{once:true});if(signal?.aborted)cancel();
 const context=await browser.newContext({serviceWorkers:'block',acceptDownloads:false});
 const timeout=setTimeout(()=>controller.abort(),20000);const close=()=>{void context.close().catch(()=>{});};controller.signal.addEventListener('abort',close,{once:true});
 const result={contacts:[],owners:[],sizeFacts:[],pages:[]};let requests=0;
 try{await context.route('**/*',async route=>{const req=route.request();if(++requests>30||req.method()!=='GET'||['image','media','font','stylesheet'].includes(req.resourceType())||req.isNavigationRequest()&&domain(req.url())!==domain(base))return route.abort().catch(()=>{});try{const response=await safeFetchText(req.url(),0,{signal:controller.signal,...(req.isNavigationRequest()?{allowedHost:domain(base)}:{})});await route.fulfill({status:response.status,contentType:response.contentType,body:response.text});}catch{await route.abort().catch(()=>{});}});
  const page=await context.newPage();for(const path of ['/','/about','/contact']){if(controller.signal.aborted)break;try{await page.goto(new URL(path,base).href,{waitUntil:'domcontentloaded',timeout:6000});await page.waitForTimeout(700);const html=await page.content();if(html.length>2*1024*1024)continue;const f=factsFromPage(html,page.url());result.contacts.push(...f.contacts);result.owners.push(...f.owners);result.sizeFacts.push(...f.sizeFacts);result.pages.push({url:page.url(),checkedAt:Date.now(),method:'rendered-public-page'});}catch{/* Missing or blocked pages do not imply a verified role. */}}
 }finally{clearTimeout(timeout);signal?.removeEventListener('abort',cancel);await context.close().catch(()=>{});}
 return result;
}
module.exports={renderResearch};
