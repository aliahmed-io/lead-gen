'use strict';
require('./bootstrap').ensure();
const stop=require('./monitor').start();
function shutdown(){stop();process.exit(0);}
process.on('SIGINT',shutdown);process.on('SIGTERM',shutdown);
if(process.send)process.on('disconnect',shutdown);
console.log('Account protection monitor started. This process never sends email.');
