const nodemailer = require('nodemailer');

async function testPorts() {
  console.log('Testing Port 587 (STARTTLS)...');
  const t587 = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    auth: { user: 'ali@aethelonhq.com', pass: 'ixlrpexcdynvxkgf' }
  });
  try {
    await t587.verify();
    console.log('✅ SMTP Port 587 SUCCESS for ali@aethelonhq.com!');
  } catch (err) {
    console.log('❌ SMTP Port 587 FAIL:', err.message);
  }

  console.log('Testing Port 465 (SSL)...');
  const t465 = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: { user: 'ali@aethelonhq.com', pass: 'ixlrpexcdynvxkgf' }
  });
  try {
    await t465.verify();
    console.log('✅ SMTP Port 465 SUCCESS for ali@aethelonhq.com!');
  } catch (err) {
    console.log('❌ SMTP Port 465 FAIL:', err.message);
  }
}

testPorts();
