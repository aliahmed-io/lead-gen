'use strict';
const directories=new Set(['facebook.com','instagram.com','linkedin.com','twitter.com','x.com','tiktok.com','youtube.com','youtu.be','google.com','google.co.uk','maps.app.goo.gl','goo.gl','yelp.com','pinterest.com','linktr.ee','wa.me','whatsapp.com']);
function websiteInfo(lead={}){
 const urls=[lead.website,...(Array.isArray(lead.websites)?lead.websites:[])].filter(v=>typeof v==='string'&&v.trim());
 const sites=urls.filter(value=>{try{const u=new URL(/^https?:\/\//i.test(value)?value:'https://'+value);const h=u.hostname.toLowerCase().replace(/^www\./,'');return ['http:','https:'].includes(u.protocol)&&!u.username&&!u.password&&h.includes('.')&&!['example.com','example.org','test.com'].includes(h)&&![...directories].some(d=>h===d||h.endsWith('.'+d));}catch{return false;}});
 const known=Boolean(Object.hasOwn(lead,'website')||Object.hasOwn(lead,'websites')||lead.hasBusinessWebsite!=null||urls.length);
 return {websiteStatus:sites.length?'with_website':known?'no_website_listed':'unknown',hasBusinessWebsite:sites.length?true:known?false:null,businessWebsite:sites[0]||'',outreachSegment:sites.length?'existing_website':known?'website_creation':'unclassified'};
}
const noWebsiteKeys={initial:'noWebsite_initial',followUp1:'noWebsite_followUp1',followUp2:'noWebsite_followUp2',followUp3:'noWebsite_followUp3',breakup:'noWebsite_breakup'};
function templateKey(key,lead){return websiteInfo(lead).websiteStatus==='no_website_listed'?(noWebsiteKeys[key]||key):key;}
module.exports={websiteInfo,templateKey};
