const fs = require('fs');
const path = require('path');

function getTemplates() {
  const tplPath = path.join(__dirname, 'templates.json');
  if (fs.existsSync(tplPath)) {
    try {
      return JSON.parse(fs.readFileSync(tplPath, 'utf8'));
    } catch (e) {
      console.error('Error parsing templates.json. Using defaults.');
    }
  }
  return {};
}

function parseTemplate(templateString, data) {
  if (!templateString) return '';
  return templateString.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    return data[key] || '';
  });
}

module.exports = {
  getInitialEmail: (data) => {
    const tpl = getTemplates().initial || {};
    return {
      subject: parseTemplate(tpl.subject, data),
      text: parseTemplate(tpl.text, data)
    };
  },

  getFollowUpEmail1: (data) => {
    const tpl = getTemplates().followUp1 || {};
    return {
      subject: parseTemplate(tpl.subject, data),
      text: parseTemplate(tpl.text, data)
    };
  },

  getFollowUpEmail2: (data) => {
    const tpl = getTemplates().followUp2 || {};
    return {
      subject: parseTemplate(tpl.subject, data),
      text: parseTemplate(tpl.text, data)
    };
  },

  getEmail: (templateKey, data, variant = null) => {
    // Map sequence definition keys to the actual keys in templates.json
    const keyMap = {
      'initial': 'initial',
      'followup1': 'followUp1',
      'followup2': 'followUp2',
      'followup3': 'followUp3',
      'breakup': 'breakup'
    };
    
    const actualKey = keyMap[templateKey] || templateKey;
    const tpl = getTemplates()[actualKey] || {};

    let subjectRaw = tpl.subject;
    if (variant && tpl[`subject${variant}`]) {
      subjectRaw = tpl[`subject${variant}`];
    }

    return {
      subject: parseTemplate(subjectRaw || `Default Subject (${templateKey})`, data),
      text: parseTemplate(tpl.text || `Default Text (${templateKey})`, data)
    };
  }
};
