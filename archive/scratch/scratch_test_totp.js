const { generateTOTP } = require('./dashboard/src/lib/totp');

async function test() {
  const secret = 'zxf4zldxuoqj4hridrq7vf2hxktyk4h6';
  const res = await generateTOTP(secret);
  console.log('TOTP Result:', res);
}

test();
