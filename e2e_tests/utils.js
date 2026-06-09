const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');

function runCommand(command, env = {}) {
  try {
    const output = execSync(command, { 
      cwd: rootDir, 
      encoding: 'utf-8',
      env: { ...process.env, ...env },
      stdio: 'pipe'
    });
    return { success: true, output };
  } catch (err) {
    return { success: false, output: err.stdout + '\n' + err.stderr, exitCode: err.status };
  }
}

function withTempDb(dbContent, testFn) {
  const dbPath = path.join(rootDir, 'leads_db.json');
  let originalDb = null;
  if (fs.existsSync(dbPath)) {
    originalDb = fs.readFileSync(dbPath, 'utf-8');
  }
  fs.writeFileSync(dbPath, dbContent, 'utf-8');
  
  try {
    testFn();
  } finally {
    if (originalDb !== null) {
      fs.writeFileSync(dbPath, originalDb, 'utf-8');
    } else {
      fs.unlinkSync(dbPath);
    }
  }
}

function withTempEnv(envContent, testFn) {
  const envPath = path.join(rootDir, '.env');
  let originalEnv = null;
  if (fs.existsSync(envPath)) {
    originalEnv = fs.readFileSync(envPath, 'utf-8');
  }
  fs.writeFileSync(envPath, envContent, 'utf-8');
  
  try {
    testFn();
  } finally {
    if (originalEnv !== null) {
      fs.writeFileSync(envPath, originalEnv, 'utf-8');
    } else {
      fs.unlinkSync(envPath);
    }
  }
}

module.exports = {
  runCommand,
  withTempDb,
  withTempEnv,
  rootDir
};
