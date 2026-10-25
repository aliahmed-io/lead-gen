module.exports=require('./sender');if(require.main===module)require('./sender').startCampaign().then(r=>console.log(JSON.stringify(r))).catch(e=>{console.error(e.message);process.exitCode=1;});
