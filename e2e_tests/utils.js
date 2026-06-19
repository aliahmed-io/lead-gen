const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');

function runCommand(command, env = {}) {
  try {
    const output = execSync(command, { 
      cwd: rootDir, 
      encoding: 'utf-8',
      env: { ...process.env, E2E_TESTS: 'true', ...env },
      stdio: 'pipe'
    });
    return { success: true, output };
  } catch (err) {
    return { success: false, output: err.stdout + '\n' + err.stderr, exitCode: err.status };
  }
}

function writeFileSyncWithRetry(filepath, content, retries = 5, delay = 200) {
  for (let i = 0; i < retries; i++) {
    try {
      fs.writeFileSync(filepath, content, 'utf-8');
      return;
    } catch (err) {
      if ((err.code === 'EPERM' || err.code === 'EBUSY') && i < retries - 1) {
        const start = Date.now();
        while (Date.now() - start < delay) {}
        continue;
      }
      throw err;
    }
  }
}

function unlinkSyncWithRetry(filepath, retries = 5, delay = 200) {
  for (let i = 0; i < retries; i++) {
    try {
      if (fs.existsSync(filepath)) {
        fs.unlinkSync(filepath);
      }
      return;
    } catch (err) {
      if ((err.code === 'EPERM' || err.code === 'EBUSY') && i < retries - 1) {
        const start = Date.now();
        while (Date.now() - start < delay) {}
        continue;
      }
      throw err;
    }
  }
}

function withTempDb(dbContent, testFn) {
  const dbPath = path.join(rootDir, 'leads_db.json');
  let originalDb = null;
  if (fs.existsSync(dbPath)) {
    originalDb = fs.readFileSync(dbPath, 'utf-8');
  }
  writeFileSyncWithRetry(dbPath, dbContent);
  
  try {
    testFn();
  } finally {
    if (originalDb !== null) {
      writeFileSyncWithRetry(dbPath, originalDb);
    } else {
      unlinkSyncWithRetry(dbPath);
    }
  }
}

function withTempEnv(envContent, testFn) {
  const envPath = path.join(rootDir, '.env');
  let originalEnv = null;
  if (fs.existsSync(envPath)) {
    originalEnv = fs.readFileSync(envPath, 'utf-8');
  }
  writeFileSyncWithRetry(envPath, envContent);
  
  try {
    testFn();
  } finally {
    if (originalEnv !== null) {
      writeFileSyncWithRetry(envPath, originalEnv);
    } else {
      unlinkSyncWithRetry(envPath);
    }
  }
}

module.exports = {
  runCommand,
  withTempDb,
  withTempEnv,
  rootDir
};
