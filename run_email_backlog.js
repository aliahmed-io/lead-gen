const { LeadsDatabase } = require('./db');
const { findEmails } = require('./emailFinder');

async function run({signal}={}) {
  console.log('🚀 Starting Email Backlog Scanner...');
  const db = new LeadsDatabase();
  const backlog = db.getNeedingEmailScan();
  console.log(`Found ${backlog.length} leads needing email scan.`);
  if (backlog.length === 0) {
    console.log('✅ All leads with websites have already been scanned.');
    return;
  }
  await findEmails(backlog, db,{signal});
  db.save();
  console.log('🎉 Email Backlog Scan complete!');
}

if (require.main === module) {
  run().catch(err => {
    console.error('❌ Error during email scan:', err);
    process.exit(1);
  });
}

module.exports = { run };
