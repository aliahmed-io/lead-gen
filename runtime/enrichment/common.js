'use strict';
const path = require('node:path');
const { createRequire } = require('node:module');
const app = createRequire(path.join(process.env.LEADGEN_APP_ROOT || path.resolve(__dirname, '../..'), 'package.json'));
const research = app('./runtime/master-research');
function domain(value) {
  try {
    const u = new URL(/^https?:\/\//i.test(value) ? value : 'https://' + value);
    if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password || !['', '80', '443'].includes(u.port)) return '';
    const h = u.hostname.toLowerCase().replace(/^www\./, '');
    return /^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,63}$/.test(h) ? h : '';
  } catch { return ''; }
}
const personKey = name => research.slug(name);
const publicUrl = value => /^https?:\/\//i.test(String(value || '')) && domain(value) ? String(value).slice(0, 2000) : '';
function email(value) {
  const result = String(value || '').trim().toLowerCase();
  return app('./runtime/verification').isValidSyntax(result) && !research.isDepartment(result) && !app('./runtime/verification').isRoleBasedEmail(result) ? result : '';
}
function decisionMaker(role) {
  const text = String(role || '');
  if (/\b(?:founder|cofounder|co-founder|proprietor|co[- ]owner)\b|\bowned (?:and operated )?by\b/i.test(text)) return true;
  if (/\bowner\b/i.test(text) && !/\b(?:product|process|data|service|account) owner\b/i.test(text)) return true;
  return !/\b(?:vice|assistant|deputy|regional|branch)\b/i.test(text) && /\b(?:ceo|chief executive|president)\b/i.test(text);
}
module.exports = { app, ...research, domain, personKey, publicUrl, email, decisionMaker };
