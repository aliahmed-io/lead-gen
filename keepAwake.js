// @ts-check
/**
 * @module keepAwake
 * @description Prevent the operating system from sleeping, hibernating,
 * or suspending while the scraper runs. Also overrides the laptop lid-
 * close action to "do nothing" on Windows so the script survives a
 * closed lid.
 *
 * On exit, all original power settings are restored automatically.
 *
 * Platform support:
 *   Windows — powercfg + SetThreadExecutionState via PowerShell helper
 *   macOS   — caffeinate child process
 *   Linux   — systemd-inhibit child process
 */

const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

/* ------------------------------------------------------------------ */
/*  Module state                                                      */
/* ------------------------------------------------------------------ */

/** @type {import('child_process').ChildProcess|null} */
let keepAliveProcess = null;

/** @type {string|null} Path to the temporary PowerShell helper script */
let tempScriptPath = null;

/** @type {boolean} */
let isActive = false;

/** @type {{ lidAc: number|null, lidDc: number|null, standbyAc: number|null, standbyDc: number|null, hibernateAc: number|null, hibernateDc: number|null }} */
const saved = {
  lidAc: null,
  lidDc: null,
  standbyAc: null,
  standbyDc: null,
  hibernateAc: null,
  hibernateDc: null,
};

/* ------------------------------------------------------------------ */
/*  Internal helpers                                                  */
/* ------------------------------------------------------------------ */

/**
 * Run a shell command synchronously, swallowing errors.
 * @param {string} cmd
 * @returns {string|null} stdout or null on failure.
 */
function safeExec(cmd) {
  try {
    return execSync(cmd, {
      encoding: 'utf8',
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  } catch {
    return null;
  }
}

/**
 * Parse a hex index value from powercfg query output.
 *
 * @param {string|null} output - raw powercfg output.
 * @param {string} label - e.g. "Current AC Power Setting Index".
 * @returns {number|null}
 */
function parsePowerIndex(output, label) {
  if (!output) return null;
  for (const line of output.split('\n')) {
    if (line.includes(label)) {
      const m = line.match(/0x([0-9a-fA-F]+)/);
      return m && m[1] ? parseInt(m[1], 16) : null;
    }
  }
  return null;
}

/**
 * Query and cache the current Windows power-plan settings so they can
 * be restored later.
 */
function saveWindowsSettings() {
  const lid = safeExec(
    'powercfg /query SCHEME_CURRENT SUB_BUTTONS LIDACTION'
  );
  saved.lidAc = parsePowerIndex(lid, 'Current AC Power Setting Index');
  saved.lidDc = parsePowerIndex(lid, 'Current DC Power Setting Index');

  const standby = safeExec(
    'powercfg /query SCHEME_CURRENT SUB_SLEEP STANDBYIDLE'
  );
  saved.standbyAc = parsePowerIndex(
    standby,
    'Current AC Power Setting Index'
  );
  saved.standbyDc = parsePowerIndex(
    standby,
    'Current DC Power Setting Index'
  );

  const hibernate = safeExec(
    'powercfg /query SCHEME_CURRENT SUB_SLEEP HIBERNATEIDLE'
  );
  saved.hibernateAc = parsePowerIndex(
    hibernate,
    'Current AC Power Setting Index'
  );
  saved.hibernateDc = parsePowerIndex(
    hibernate,
    'Current DC Power Setting Index'
  );
}

/**
 * Create a temporary PowerShell script that calls the Win32
 * SetThreadExecutionState API every 30 seconds to signal the OS that
 * the system and display are required.
 *
 * Flags: ES_CONTINUOUS | ES_SYSTEM_REQUIRED | ES_DISPLAY_REQUIRED
 *        0x80000000    | 0x00000001         | 0x00000002 = 0x80000003
 *
 * @returns {string} Absolute path to the generated .ps1 file.
 */
function createKeepAliveScript() {
  const scriptPath = path.join(
    os.tmpdir(),
    `lead-scraper-awake-${process.pid}.ps1`
  );

  fs.writeFileSync(
    scriptPath,
    [
      'Add-Type -TypeDefinition @"',
      'using System;',
      'using System.Runtime.InteropServices;',
      'public class SleepGuard {',
      '    [DllImport("kernel32.dll")]',
      '    public static extern uint SetThreadExecutionState(uint esFlags);',
      '}',
      '"@',
      '',
      'while ($true) {',
      '    [SleepGuard]::SetThreadExecutionState(0x80000003) | Out-Null',
      '    Start-Sleep -Seconds 30',
      '}',
    ].join('\r\n'),
    'utf8'
  );

  return scriptPath;
}

/* ------------------------------------------------------------------ */
/*  Public API                                                        */
/* ------------------------------------------------------------------ */

/**
 * Activate sleep prevention for the current platform.
 *
 * **Windows behaviour:**
 *   1. Saves current standby / hibernate / lid-close settings.
 *   2. Sets standby and hibernate timeouts to 0 (never).
 *   3. Sets lid-close action to "do nothing" (AC and DC).
 *   4. Spawns a background PowerShell process that periodically calls
 *      SetThreadExecutionState as a belt-and-suspenders measure.
 *
 * **macOS:** spawns `caffeinate -i -s -d`.
 * **Linux:** spawns `systemd-inhibit`.
 *
 * Safe to call multiple times — only activates once.
 */
function preventSleep() {
  if (isActive) return;

  if (process.platform === 'win32') {
    /* ── Save originals ──────────────────────────────────────── */
    saveWindowsSettings();

    /* ── Disable standby & hibernate ─────────────────────────── */
    safeExec('powercfg /change standby-timeout-ac 0');
    safeExec('powercfg /change standby-timeout-dc 0');
    safeExec('powercfg /change hibernate-timeout-ac 0');
    safeExec('powercfg /change hibernate-timeout-dc 0');

    /* ── Lid close → do nothing ──────────────────────────────── */
    safeExec(
      'powercfg /setacvalueindex SCHEME_CURRENT SUB_BUTTONS LIDACTION 0'
    );
    safeExec(
      'powercfg /setdcvalueindex SCHEME_CURRENT SUB_BUTTONS LIDACTION 0'
    );
    safeExec('powercfg /setactive SCHEME_CURRENT');

    /* ── Spawn SetThreadExecutionState helper ────────────────── */
    try {
      tempScriptPath = createKeepAliveScript();

      keepAliveProcess = spawn(
        'powershell',
        [
          '-NoProfile',
          '-ExecutionPolicy',
          'Bypass',
          '-File',
          tempScriptPath,
        ],
        { stdio: 'ignore', windowsHide: true }
      );

      keepAliveProcess.on('error', () => {
        /* PowerShell unavailable — powercfg alone is still active */
      });
    } catch {
      /* non-fatal */
    }

    isActive = true;
    console.log('\u{1F50B} Sleep prevention active:');
    console.log('   \u2022 System standby & hibernate disabled');
    console.log('   \u2022 Lid close action \u2192 do nothing');
    console.log('   \u2022 SetThreadExecutionState keep-alive running');
  } else if (process.platform === 'darwin') {
    try {
      keepAliveProcess = spawn('caffeinate', ['-i', '-s', '-d'], {
        stdio: 'ignore',
      });
      isActive = true;
      console.log('\u{1F50B} Sleep prevention active (caffeinate)');
    } catch {
      console.warn(
        '\u26A0\uFE0F  Could not start caffeinate — system may sleep'
      );
    }
  } else {
    try {
      keepAliveProcess = spawn(
        'systemd-inhibit',
        [
          '--what=idle:sleep',
          '--who=lead-scraper',
          '--why=Lead scraping in progress',
          'sleep',
          'infinity',
        ],
        { stdio: 'ignore' }
      );
      isActive = true;
      console.log('\u{1F50B} Sleep prevention active (systemd-inhibit)');
    } catch {
      console.warn(
        '\u26A0\uFE0F  Could not inhibit sleep — systemd-inhibit not available'
      );
    }
  }
}

/**
 * Deactivate sleep prevention and restore original power settings.
 *
 * Safe to call multiple times — only deactivates once. Also safe
 * inside process 'exit' handlers (all operations are synchronous).
 */
function allowSleep() {
  if (!isActive) return;

  /* Kill the keep-alive process */
  if (keepAliveProcess) {
    try {
      keepAliveProcess.kill();
    } catch {
      /* already gone */
    }
    keepAliveProcess = null;
  }

  /* Remove temp script */
  if (tempScriptPath) {
    try {
      fs.unlinkSync(tempScriptPath);
    } catch {
      /* already gone */
    }
    tempScriptPath = null;
  }

  if (process.platform === 'win32') {
    /* ── Restore standby ─────────────────────────────────────── */
    if (saved.standbyAc != null) {
      safeExec(
        `powercfg /change standby-timeout-ac ${Math.round(saved.standbyAc / 60)}`
      );
    }
    if (saved.standbyDc != null) {
      safeExec(
        `powercfg /change standby-timeout-dc ${Math.round(saved.standbyDc / 60)}`
      );
    }

    /* ── Restore hibernate ───────────────────────────────────── */
    if (saved.hibernateAc != null) {
      safeExec(
        `powercfg /change hibernate-timeout-ac ${Math.round(saved.hibernateAc / 60)}`
      );
    }
    if (saved.hibernateDc != null) {
      safeExec(
        `powercfg /change hibernate-timeout-dc ${Math.round(saved.hibernateDc / 60)}`
      );
    }

    /* ── Restore lid action ──────────────────────────────────── */
    if (saved.lidAc != null) {
      safeExec(
        `powercfg /setacvalueindex SCHEME_CURRENT SUB_BUTTONS LIDACTION ${saved.lidAc}`
      );
    }
    if (saved.lidDc != null) {
      safeExec(
        `powercfg /setdcvalueindex SCHEME_CURRENT SUB_BUTTONS LIDACTION ${saved.lidDc}`
      );
    }
    safeExec('powercfg /setactive SCHEME_CURRENT');

    console.log('\u{1F50B} Original power settings restored');
  } else {
    console.log('\u{1F50B} Sleep prevention removed');
  }

  isActive = false;
}

module.exports = { preventSleep, allowSleep };
