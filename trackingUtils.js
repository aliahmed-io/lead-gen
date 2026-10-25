'use strict';
require('./runtime/bootstrap').ensure();const {publicToken}=require('./runtime/auth');const base=()=>String(process.env.DASHBOARD_URL||'').replace(/\/$/,'');
function rewriteLinksForTracking(text,email){if(process.env.ENABLE_TRACKING!=='1'||!base())return text;return String(text).replace(/https?:\/\/[^\s<>"{}|\\^`\[\]]+/g,url=>url.includes('/unsubscribe/')||url.startsWith(base())?url:base()+'/api/track/click?token='+publicToken('click',{email,url}));}
function getTrackingPixelUrl(email){return process.env.ENABLE_TRACKING==='1'&&base()?base()+'/api/track/open?token='+publicToken('open',{email}):'';}
function prepareEmailPayload(text,email){return {text:rewriteLinksForTracking(text,email),html:undefined};}
module.exports={rewriteLinksForTracking,getTrackingPixelUrl,prepareEmailPayload,injectTrackingPixel:text=>text};
