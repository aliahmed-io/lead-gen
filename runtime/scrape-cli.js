require('./bootstrap').ensure();console.log(require('./leadgen').call('POST',{action:process.argv.includes('--emails-only')?'start_email_scan':'start_scraper'}));
