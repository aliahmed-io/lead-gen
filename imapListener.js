module.exports={startListener:require('./replyDetector').checkReplies};if(require.main===module)module.exports.startListener().catch(e=>{console.error(e.message);process.exitCode=1;});
