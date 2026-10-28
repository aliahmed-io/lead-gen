'use strict';
// A separate tunnel/HTTPS proxy can expose this listener without exposing the dashboard.
const http=require('http');
const auth=require('./auth');
const models=require('./models');
function handler(request,response){
 const reply=(status,text,type='text/plain; charset=utf-8')=>{response.writeHead(status,{'Content-Type':type,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'none'; form-action 'self'; frame-ancestors 'none'"});response.end(text);};
 let url;try{url=new URL(request.url,'http://localhost');}catch{return reply(400,'Invalid request');}
 if(url.pathname==='/health'&&request.method==='GET')return reply(200,'LeadGen unsubscribe service');
 if(url.pathname!=='/api/unsubscribe/one-click')return reply(404,'Not found');
 if(!['GET','POST'].includes(request.method)){response.setHeader('Allow','GET, POST');return reply(405,'Method not allowed');}
 const token=url.searchParams.get('token')||'';
 if(token.length>4096)return reply(400,'Invalid unsubscribe link');
 const payload=auth.verify(token);
 if(payload?.type!=='unsubscribe'||!require('./verification').isValidSyntax(payload.email))return reply(400,'Invalid unsubscribe link. Reply to the sender to request removal.');
 if(request.method==='GET')return reply(200,'<!doctype html><html lang="en"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Unsubscribe</title><body><main><h1>Stop future outreach</h1><p>Confirm below to stop future messages.</p><form method="post" action="?token='+encodeURIComponent(token)+'"><input type="hidden" name="List-Unsubscribe" value="One-Click"><button type="submit">Unsubscribe</button></form></main></body></html>','text/html; charset=utf-8');
 // Suppress immediately without buffering an attacker-controlled request body.
 try{models.suppress(payload.email,'Signed public unsubscribe');request.resume();return reply(200,'You have been unsubscribed from future outreach.');}catch{return reply(503,'Unable to save your request. Please reply to the sender to request removal.');}
}
function createServer(){const server=http.createServer({maxHeaderSize:16384},handler);server.requestTimeout=15000;server.headersTimeout=10000;return server;}
function start(){require('./bootstrap').ensure();const port=Number(process.env.OPTOUT_PORT||3001);if(!Number.isInteger(port)||port<1024||port>65535)throw new Error('OPTOUT_PORT must be 1024–65535');const server=createServer();server.listen(port,'127.0.0.1',()=>console.log('Unsubscribe listener on 127.0.0.1:'+port+'; dashboard routes are unavailable here.'));return server;}
if(require.main===module){const server=start();process.on('disconnect',()=>server.close(()=>process.exit(0)));}
module.exports={handler,createServer,start};
