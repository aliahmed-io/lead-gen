const nodemailer = require('nodemailer');

const accounts = [
  { email: 'ali@getaethelon.com', pass: 'vnxlldtvuthnvpmp' },
  { email: 'ali@aethelonhq.com', pass: 'ixlrpexcdynvxkgf' }
];

async function testSmtp() {
  for (const acc of accounts) {
    console.log(`Testing SMTP auth for ${acc.email}...`);
    const transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: { user: acc.email, pass: acc.pass }
    });

    try {
      await transporter.verify();
      console.log(`✅ SMTP VERIFIED: ${acc.email}`);
    } catch (err) {
      console.log(`❌ SMTP AUTH FAILED for ${acc.email}: ${err.message}`);
    }
  }
}

testSmtp();
