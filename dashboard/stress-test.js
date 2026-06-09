const http = require('http');

const request = (options, postData) => {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        resolve({ status: res.statusCode, data });
      });
    });
    req.on('error', reject);
    if (postData) {
      req.write(postData);
    }
    req.end();
  });
};

const runTests = async () => {
  console.log("Starting stress & boundary tests...");
  const host = 'localhost';
  const port = 3000;
  
  const endpointPaths = ['/api/settings', '/api/templates'];
  let passed = true;

  for (const path of endpointPaths) {
    console.log(`\nTesting POST ${path} with malformed JSON...`);
    try {
      const res = await request({
        hostname: host,
        port: port,
        path: path,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      }, '{ bad json');
      
      console.log(`Status: ${res.status}, Response: ${res.data}`);
      if (res.status !== 400) {
        console.error(`FAIL: Expected 400, got ${res.status}`);
        passed = false;
      } else {
        console.log("PASS");
      }
    } catch (e) {
      console.error("FAIL: Error making request", e);
      passed = false;
    }

    console.log(`\nTesting POST ${path} with invalid types...`);
    try {
      const res = await request({
        hostname: host,
        port: port,
        path: path,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      }, '"just a string"');
      
      console.log(`Status: ${res.status}, Response: ${res.data}`);
      if (res.status !== 400) {
        console.error(`FAIL: Expected 400, got ${res.status}`);
        passed = false;
      } else {
        console.log("PASS");
      }
    } catch (e) {
      console.error("FAIL: Error making request", e);
      passed = false;
    }
    
    console.log(`\nTesting POST ${path} with missing required fields / invalid field types...`);
    try {
      const payload = path === '/api/settings' ? '{"delayMinMs": "not_a_number"}' : '{"template1": {"subject": 123}}';
      const res = await request({
        hostname: host,
        port: port,
        path: path,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      }, payload);
      
      console.log(`Status: ${res.status}, Response: ${res.data}`);
      if (res.status !== 400) {
        console.error(`FAIL: Expected 400, got ${res.status}`);
        passed = false;
      } else {
        console.log("PASS");
      }
    } catch (e) {
      console.error("FAIL: Error making request", e);
      passed = false;
    }
  }

  if (passed) {
    console.log("\nALL TESTS PASSED.");
  } else {
    console.log("\nSOME TESTS FAILED.");
    process.exit(1);
  }
};

runTests();
