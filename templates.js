const fs = require('fs');
const path = require('path');
const { errOf } = require('./utils');

function getTemplates() {
  const tplPath = path.join(__dirname, 'templates.json');
  if (fs.existsSync(tplPath)) {
    try {
      return JSON.parse(fs.readFileSync(tplPath, 'utf8'));
    } catch (e) {
      console.error('Error parsing templates.json. Using defaults.', errOf(e).message);
    }
  }
  return {};
}

/**
 * Extracts and capitalizes a clean first name from lead data or email address.
 * E.g., 'alex.smith@domain.com' -> 'Alex'
 * E.g., 'info@domain.com' -> '' (falls back to 'there')
 *
 * @param {TemplateData} data
 */
function extractFirstName(data) {
  if (data.firstName && typeof data.firstName === 'string' && data.firstName.trim()) {
    return capitalize(data.firstName.trim().split(' ')[0]);
  }
  if (data['First Name'] && typeof data['First Name'] === 'string' && data['First Name'].trim()) {
    return capitalize(data['First Name'].trim().split(' ')[0]);
  }
  if (data.contactName && typeof data.contactName === 'string' && data.contactName.trim()) {
    return capitalize(data.contactName.trim().split(' ')[0]);
  }

  // Email prefix decoder
  if (data.email && typeof data.email === 'string' && data.email.includes('@')) {
    const localPart = data.email.split('@')[0].toLowerCase().trim();
    const genericPrefixes = ['info', 'contact', 'sales', 'support', 'admin', 'hello', 'office', 'mail', 'inquiries', 'help', 'team', 'service', 'billing', 'orders', 'marketing', 'jobs', 'careers'];
    
    if (!genericPrefixes.includes(localPart)) {
      // Split by dot, underscore, or hyphen (e.g., 'alex.smith' -> 'alex')
      const namePart = localPart.split(/[._-]/)[0];
      // Only use if namePart contains only alphabetic characters and is at least 2 chars
      if (/^[a-zA-Z]{2,15}$/.test(namePart)) {
        return capitalize(namePart);
      }
    }
  }

  return '';
}

/**
 * @param {string} str
 */
function capitalize(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

/**
 * Convenience accessors used by the follow-up runner, backed by getEmail().
 *
 * @param {TemplateData} data
 * @param {string} [variant]
 */
function getFollowUpEmail1(data, variant) {
  return getEmail('followup1', data, variant);
}

/**
 * @param {TemplateData} data
 * @param {string} [variant]
 */
function getFollowUpEmail2(data, variant) {
  return getEmail('followup2', data, variant);
}

/**
 * @param {string} templateString
 * @param {TemplateData} data
 */
function parseTemplate(templateString, data) {
  if (!templateString) return '';
  
  const extractedName = extractFirstName(data);
  const firstNameVal = extractedName || 'there';

  const vars = {
    'First Name': firstNameVal,
    'firstName': firstNameVal,
    'Company': data.companyName || data['Company'] || data.businessName || 'your brand',
    'companyName': data.companyName || data['Company'] || data.businessName || 'your brand',
    'Portfolio': 'https://aethelonlabs.com',
    'portfolio': 'https://aethelonlabs.com',
    'city': data.city || 'your area',
    'state': data.state || 'your state',
    'website': data.website || '',
    'customSentence': data.customSentence || ''
  };

  /** @type {Record<string, string>} */
  const varsMap = vars;
  const dataMap = /** @type {Record<string, unknown>} */ (data);
  return templateString.replace(/\{\{([^}]+)\}\}/g, (match, rawKey) => {
    const key = rawKey.trim();
    if (varsMap[key] !== undefined) return varsMap[key];
    if (dataMap[key] !== undefined) return String(dataMap[key]);
    return match;
  });
}

/**
 * @param {string} templateKey
 * @param {TemplateData} data
 * @param {string} [variant]
 */
function getEmail(templateKey, data, variant = 'A') {
  const keyMap = /** @type {Record<string, string>} */ ({
    'initial': 'initial',
    'followup1': 'followUp1',
    'followup2': 'followUp2'
  });

  const actualKey = keyMap[templateKey] || templateKey;
  /** @type {Record<string, string>} */
  const tpl = getTemplates()[actualKey] || {};

  let subjectRaw = tpl.subject;
  if (variant && tpl[`subject${variant}`]) {
    subjectRaw = tpl[`subject${variant}`];
  }

  let textRaw = tpl.text;
  if (variant && tpl[`text${variant}`]) {
    textRaw = tpl[`text${variant}`];
  }

  return {
    subject: parseTemplate(subjectRaw || `Quick question for {{Company}}`, data),
    text: parseTemplate(textRaw || tpl.text || '', data)
  };
}

module.exports = {
  getTemplates,
  extractFirstName,
  parseTemplate,
  getFollowUpEmail1,
  getFollowUpEmail2,
  getEmail
};
