'use strict';
const net=require('net');
const {isPrivate}=require('./network');
const {isValidSyntax}=require('./verification');
const CHAIN_DOMAINS=require('./chain-domains');
const MAX_EMPLOYEES=250;
const REVIEW_TTL=90*86400000;
const normal=v=>String(v||'').trim().toLowerCase();
function sourceUrl(value){try{const u=new URL(value);if(!['https:','http:'].includes(u.protocol)||u.username||u.password||u.hostname==='localhost'||!u.hostname.includes('.')||net.isIP(u.hostname)&&isPrivate(u.hostname))return '';return u.href;}catch{return '';}}
function domain(value){try{return new URL(/^https?:\/\//i.test(value)?value:'https://'+value).hostname.toLowerCase().replace(/^www\./,'');}catch{return '';}}
function genericEmail(email){return /^(info|hello|contact|sales|support|help|office|team|admin|billing|accounts|hr|careers|jobs|orders|service|customerservice|marketing|enquiries|inquiries|no-?reply)([.+_-].*)?@/i.test(email);}
function exclusion(lead){
 const host=domain(lead.website||'');
 if(CHAIN_DOMAINS.some(d=>host===d||host.endsWith('.'+d)))return 'Known chain or enterprise domain';
 const count=lead.targetReview?.employeeCount;
 if(Number.isFinite(count)&&count>MAX_EMPLOYEES)return 'Business exceeds the 250-person targeting ceiling';
 const facts=lead.research?.sizeFacts||[];
 if(facts.some(f=>f.minimum>MAX_EMPLOYEES))return 'Published employee count exceeds the targeting ceiling';
 return null;
}
function assess(lead,now=Date.now()){
 const excluded=exclusion(lead);
 if(lead.quarantined)return {status:'excluded',ready:false,reasons:['Generated or unsourced contact is quarantined']};
 if(excluded)return {status:'excluded',ready:false,reasons:[excluded]};
 const r=lead.targetReview,reasons=[];
 if(!r||r.email!==normal(lead.email)||!['owner','co-owner'].includes(r.role)||!r.currentOwner||!r.ownerName?.trim()||!sourceUrl(r.ownerSourceUrl)||!r.ownerEvidence||r.ownerEvidence.trim().length<20||!r.reviewedAt||now-r.reviewedAt>REVIEW_TTL)reasons.push('Current owner and this exact email need evidence review');
 if(genericEmail(lead.email))reasons.push('A direct owner address is required; shared departmental addresses are excluded');
 if(!r?.independent||!Number.isInteger(r.employeeCount)||r.employeeCount<1||r.employeeCount>MAX_EMPLOYEES||!sourceUrl(r.sizeSourceUrl)||!r.sizeEvidence||r.sizeEvidence.trim().length<20||!r.reviewedAt||now-r.reviewedAt>REVIEW_TTL)reasons.push('Independent business size of 1–250 people needs evidence review');
 if(!isValidSyntax(normal(lead.email)))reasons.push('A valid selected contact email is required');
 return {status:reasons.length?'needs_review':'qualified',ready:!reasons.length,reasons};
}
function validateReview(input,lead,now=Date.now()){
 const review={email:normal(input.email||lead.email),ownerName:String(input.ownerName||'').trim(),role:input.role,currentOwner:input.currentOwner,ownerSourceUrl:sourceUrl(input.ownerSourceUrl),ownerEvidence:String(input.ownerEvidence||'').trim(),employeeCount:Number(input.employeeCount),independent:input.independent,sizeSourceUrl:sourceUrl(input.sizeSourceUrl),sizeEvidence:String(input.sizeEvidence||'').trim(),reviewedAt:now};
 for(const key of ['ownerName','ownerEvidence','sizeEvidence'])if(review[key].length>2000)throw new Error('Evidence field is too long');
 if(!['owner','co-owner'].includes(review.role)||review.currentOwner!==true||review.independent!==true)throw new Error('Confirm current ownership and independent business status');
 if(!review.ownerName||review.ownerEvidence.length<20||review.sizeEvidence.length<20||!review.ownerSourceUrl||!review.sizeSourceUrl)throw new Error('Record the owner name, public source URLs and specific supporting evidence');
 if(!Number.isInteger(review.employeeCount)||review.employeeCount<1||review.employeeCount>MAX_EMPLOYEES)throw new Error('Target only businesses with a documented 1–250 people');
 if(!isValidSyntax(review.email)||genericEmail(review.email))throw new Error('Select a direct owner email rather than a shared department mailbox');
 if(exclusion({...lead,targetReview:review}))throw new Error('Known chains and businesses outside the target size cannot be approved');
 return review;
}
module.exports={MAX_EMPLOYEES,REVIEW_TTL,sourceUrl,domain,genericEmail,exclusion,assess,validateReview};
