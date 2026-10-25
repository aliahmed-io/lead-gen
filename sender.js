require('./runtime/bootstrap').ensure();
const {run}=require('./runtime/delivery');const startCampaign=()=>run({dryRun:process.argv.includes('--dry-run')});module.exports={startCampaign};if(require.main===module)startCampaign().then(r=>console.log(JSON.stringify(r))).catch(e=>{console.error(e.message);process.exitCode=1;});
