require('../runtime/bootstrap').ensure();
const inbox=require('../runtime/store').read('inbox');
const query=String(process.argv[2]||'').toLowerCase();
for(const thread of Object.values(inbox.threads).filter(t=>!query||t.leadEmail.includes(query))){console.log(thread.leadEmail+' — '+thread.messages.length+' stored messages');}
console.log('To refresh messages, use Inbox > Sync or node --experimental-sqlite replyDetector.js. Original source files are never edited.');
