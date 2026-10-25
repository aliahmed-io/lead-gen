require('./runtime/bootstrap').ensure();const type=process.argv.includes('--emails-only')?'start_email_scan':'start_scraper';console.log(require('./runtime/leadgen').call('POST',{action:type}));
