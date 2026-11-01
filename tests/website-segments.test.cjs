'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {websiteInfo,templateKey}=require('../runtime/website-segments');
test('website classification distinguishes missing information from an explicitly empty website',()=>{
 assert.equal(websiteInfo({name:'Shop'}).websiteStatus,'unknown');
 assert.equal(websiteInfo({name:'Shop',website:''}).websiteStatus,'no_website_listed');
 assert.equal(websiteInfo({website:'https://facebook.com/store'}).hasBusinessWebsite,false);
 assert.equal(websiteInfo({website:'broken',websites:['https://oak-shop.test']}).hasBusinessWebsite,true);
 assert.equal(websiteInfo({website:'https://user:password@oak-shop.test'}).hasBusinessWebsite,false);
});
test('each sequence step routes only explicit no-website records to first-website copy',()=>{
 for(const key of ['initial','followUp1','followUp2','followUp3','breakup']){
  assert.equal(templateKey(key,{website:''}),'noWebsite_'+key);
  assert.equal(templateKey(key,{website:'https://oak-shop.test'}),key);
  assert.equal(templateKey(key,{name:'Shop'}),key);
 }
});
test('new copy is complete, uses supported variables, and contains no em dashes',()=>{
 const defs=require('../config/no-website-templates.json');const {renderText}=require('../runtime/templates');
 for(const t of Object.values(defs)){
  const text=renderText(t.subject+'\n'+t.text,{firstName:'Sam',companyName:'Oak Shop',senderName:'Ali',portfolio:'https://portfolio.test'});
  assert(!/[\u2013\u2014]/.test(text));assert(!text.includes('{{'));assert(text.includes('Oak Shop'));
 }
});
