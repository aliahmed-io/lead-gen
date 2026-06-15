const fs = require('fs');
const path = require('path');

const STATE_PATH = path.join(__dirname, 'campaign_state.json');

const DEFAULT_STATE = {
  status: 'running',
  pausedAt: null,
  pauseReason: null,
  stoppedAt: null,
};

/**
 * Loads the current campaign state from disk.
 * Returns the default 'running' state if the file does not exist.
 *
 * @returns {{ status: 'running'|'paused'|'stopped', pausedAt: number|null, pauseReason: string|null, stoppedAt: number|null }}
 */
function getState() {
  if (fs.existsSync(STATE_PATH)) {
    try {
      const raw = fs.readFileSync(STATE_PATH, 'utf-8');
      const parsed = JSON.parse(raw);
      return {
        status: parsed.status || 'running',
        pausedAt: parsed.pausedAt || null,
        pauseReason: parsed.pauseReason || null,
        stoppedAt: parsed.stoppedAt || null,
      };
    } catch (err) {
      console.error(`⚠️ Error reading campaign_state.json: ${err.message}. Defaulting to running.`);
    }
  }
  return { ...DEFAULT_STATE };
}

/**
 * Persists the given state object to disk using atomic write-then-rename.
 *
 * @param {object} state
 */
function saveState(state) {
  const tempPath = STATE_PATH + '.tmp';
  fs.writeFileSync(tempPath, JSON.stringify(state, null, 2), 'utf-8');
  fs.renameSync(tempPath, STATE_PATH);
}

/**
 * Pauses the campaign with an optional reason string.
 *
 * @param {string} [reason] - Human-readable reason for the pause.
 */
function pause(reason) {
  const state = getState();
  state.status = 'paused';
  state.pausedAt = Date.now();
  state.pauseReason = reason || null;
  saveState(state);
  console.log(`⏸️  Campaign paused${reason ? `: ${reason}` : ''}`);
}

/**
 * Resumes the campaign, clearing any pause metadata.
 */
function resume() {
  const state = getState();
  state.status = 'running';
  state.pausedAt = null;
  state.pauseReason = null;
  saveState(state);
  console.log('▶️  Campaign resumed');
}

/**
 * Stops the campaign permanently (until manually resumed).
 */
function stop() {
  const state = getState();
  state.status = 'stopped';
  state.stoppedAt = Date.now();
  saveState(state);
  console.log('⏹️  Campaign stopped');
}

/**
 * Convenience check: returns true only when the campaign status is 'running'.
 *
 * @returns {boolean}
 */
function isRunning() {
  return getState().status === 'running';
}

module.exports = { getState, pause, resume, stop, isRunning };
