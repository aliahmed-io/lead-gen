const campaignDb = require('./campaignDb');

/**
 * Opt-out / Unsubscribe management helper.
 * Wraps campaignDb methods for clean importing across backend scripts.
 */

function add(email) {
  if (!email || typeof email !== 'string') return;
  campaignDb.addUnsubscribe(email);
  campaignDb.forceSave();
  console.log(`🚫 Unsubscribed: ${email.toLowerCase().trim()}`);
}

function isUnsubscribed(email) {
  if (!email || typeof email !== 'string') return false;
  return campaignDb.isUnsubscribed(email);
}

function list() {
  return campaignDb.getUnsubscribed();
}

module.exports = {
  add,
  isUnsubscribed,
  list
};
