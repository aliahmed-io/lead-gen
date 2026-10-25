require('./runtime/bootstrap').ensure();
module.exports={checkReplies:require('./runtime/replies').sync};if(require.main===module)module.exports.checkReplies().then(r=>console.log('REPLY_SYNC_RESULT:'+JSON.stringify(r))).catch(e=>{console.error(e.message);process.exitCode=1;});
