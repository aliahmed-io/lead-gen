'use strict';
const cheerio=require('cheerio');
const {isValidSyntax}=require('./verification');
const targeting=require('./targeting');
const {safeFetchText}=require('./network');
const OWNER=/\b(owner|co[- ]owner|founder|proprietor)\b/i;
const norm=v=>String(v||'').replace(/\s+/g,' ').trim();
function factsFromPage(html,url){
 const $=cheerio.load(html);const emails=new Map(),owners=[],sizeFacts=[];
 const addEmail=(raw,text,kind='public-page')=>{const email=String(raw||'').replace(/^mailto:/i,'').split('?')[0].trim().toLowerCase();if(!isValidSyntax(email))return;const snippet=norm(text).slice(0,500);const ownerCandidate=OWNER.test(snippet)&&!targeting.genericEmail(email);const prior=emails.get(email);if(!prior||ownerCandidate&&!prior.ownerCandidate)emails.set(email,{email,sourceUrl:url,snippet,ownerCandidate,kind});};
 $('a[href^="mailto:"]').each((_,el)=>{const element=$(el);let context=element.parent();if(context.text().length<30)context=context.parent();addEmail(element.attr('href'),context.text());});
 $('script[type="application/ld+json"]').each((_,el)=>{try{const raw=JSON.parse($(el).text());const visit=(obj,depth=0)=>{if(!obj||typeof obj!=='object'||depth>8)return;if(Array.isArray(obj)){obj.slice(0,100).forEach(v=>visit(v,depth+1));return;}const type=String(obj['@type']||'');if(/Organization|Business|Store|Corporation/i.test(type)){
   const employee=obj.numberOfEmployees;const minimum=typeof employee==='number'?employee:Number(employee?.minValue??employee?.value??employee);const maximum=typeof employee==='number'?employee:Number(employee?.maxValue??employee?.value??employee);if(Number.isFinite(minimum)&&minimum>0)sizeFacts.push({minimum,maximum:Number.isFinite(maximum)?maximum:minimum,sourceUrl:url,snippet:'Published numberOfEmployees: '+JSON.stringify(employee).slice(0,250),kind:'structured-data'});
   for(const person of [obj.founder,obj.owner].flat().filter(Boolean)){const name=typeof person==='string'?person:person.name;if(name)owners.push({name:norm(name).slice(0,120),role:obj.owner===person?'owner':'founder',sourceUrl:url,snippet:'Structured business founder/owner: '+norm(name),candidate:true});if(person.email)addEmail(person.email,'Founder/owner '+name+' '+person.email,'structured-data');}
  }if(/Person/i.test(type)&&OWNER.test(String(obj.jobTitle||''))){owners.push({name:norm(obj.name).slice(0,120),role:norm(obj.jobTitle),sourceUrl:url,snippet:norm(obj.name+' '+obj.jobTitle),candidate:true});if(obj.email)addEmail(obj.email,obj.name+' '+obj.jobTitle+' '+obj.email,'structured-data');}for(const [k,v]of Object.entries(obj))if(k!=='@context')visit(v,depth+1);};visit(raw);}catch{/* Invalid publisher markup is not evidence. */}});
 $('script,style,noscript,svg').remove();
 $('p,li,address,article,section').each((_,el)=>{const text=norm($(el).text());if(!text||text.length>1200)return;for(const email of text.match(/[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,63}/ig)||[])addEmail(email,text);
  const staff=text.match(/\b(?:team of|we (?:have|employ)|staff of)\s+(\d{1,6})\s*(?:people|employees|staff|professionals|members)\b/i);if(staff)sizeFacts.push({minimum:Number(staff[1]),maximum:Number(staff[1]),sourceUrl:url,snippet:text.slice(0,500),kind:'published-text'});
 });
 const links=[];$('a[href]').each((_,el)=>{try{const u=new URL($(el).attr('href'),url);if(targeting.domain(u.href)===targeting.domain(url)&&/about|team|our-story|contact|founder|owner/i.test(u.pathname+' '+$(el).text())){u.hash='';if(!u.search)links.push(u.href);}}catch{/* Ignore malformed links. */}});
 return {contacts:[...emails.values()],owners,sizeFacts,links:[...new Set(links)].slice(0,12)};
}
async function research(lead,{fetcher=safeFetchText,maxPages=6,timeoutMs=30000,signal}={}){
 const excluded=targeting.exclusion(lead);if(excluded)return {status:'excluded',reason:excluded,contacts:[],owners:[],sizeFacts:[],pages:[],checkedAt:Date.now()};
 const base=targeting.sourceUrl(/^https?:\/\//i.test(lead.website||'')?lead.website:'https://'+(lead.website||''));if(!base)return {status:'unavailable',reason:'Public business website required',contacts:[],owners:[],sizeFacts:[],pages:[],checkedAt:Date.now()};
 const controller=new AbortController();const cancel=()=>controller.abort();signal?.addEventListener('abort',cancel,{once:true});if(signal?.aborted)cancel();const timer=setTimeout(()=>controller.abort(),timeoutMs);const initial=new URL(base);const queue=[initial.href],seen=new Set(),contacts=new Map(),owners=[],sizeFacts=[],pages=[],errors=[];
 try{while(queue.length&&seen.size<Math.min(6,maxPages)&&!controller.signal.aborted){const url=queue.shift();if(seen.has(url))continue;seen.add(url);try{const response=await fetcher(url,0,{signal:controller.signal,allowedHost:targeting.domain(base)});if(controller.signal.aborted)break;if(targeting.domain(response.url||url)!==targeting.domain(base))throw new Error('Cross-domain redirect requires separate review');if(response.contentType&&!/html|xhtml/i.test(response.contentType))throw new Error('Not an HTML page');const facts=factsFromPage(response.text,response.url||url);pages.push({url:response.url||url,checkedAt:Date.now()});for(const c of facts.contacts){const previous=contacts.get(c.email);if(!previous||c.ownerCandidate&&!previous.ownerCandidate)contacts.set(c.email,c);}owners.push(...facts.owners);sizeFacts.push(...facts.sizeFacts);for(const link of facts.links)if(!seen.has(link))queue.push(link);if(seen.size===1)for(const path of ['/about','/about-us','/our-team','/contact'])queue.push(new URL(path,base).href);}catch{errors.push({url,error:'Page unavailable or unsafe; no evidence inferred'});}}
 }finally{clearTimeout(timer);signal?.removeEventListener('abort',cancel);}
 return {status:pages.length?'researched':'unavailable',contacts:[...contacts.values()].sort((a,b)=>Number(b.ownerCandidate)-Number(a.ownerCandidate)),owners:owners.slice(0,20),sizeFacts:sizeFacts.slice(0,20),pages,errors,checkedAt:Date.now(),note:'Published facts and candidate suggestions only; owner role, exact address and business size require review'};
}
module.exports={factsFromPage,research};
