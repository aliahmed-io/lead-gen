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
  }
};
