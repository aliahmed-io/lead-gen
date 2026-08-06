const fs = require('fs');
const path = require('path');

const pagesDir = path.resolve(__dirname, '../dashboard/src/app');

function getAllFiles(dir, fileList = []) {
  const files = fs.readdirSync(dir);
  files.forEach(file => {
    const filePath = path.join(dir, file);
    if (fs.statSync(filePath).isDirectory()) {
      getAllFiles(filePath, fileList);
    } else if (file.endsWith('.tsx') || file.endsWith('.ts')) {
      fileList.push(filePath);
    }
  });
  return fileList;
}

const files = getAllFiles(pagesDir);
const detailedFlaws = [];

files.forEach(filePath => {
  const relPath = path.relative(pagesDir, filePath);
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');

  lines.forEach((line, idx) => {
    const lineNum = idx + 1;

    // 1. Dummy onClick / Empty Callback / console.log stub
    if (line.match(/onClick=\s*\{\s*\(\)\s*=>\s*\{\s*\}\s*\}/) || line.match(/onClick=\s*\{\s*\(\)\s*=>\s*console\.log/)) {
      detailedFlaws.push({
        file: relPath,
        line: lineNum,
        title: 'Dummy / No-Op Action Handler',
        snippet: line.trim(),
        fix: 'Wire up real state change, modal trigger, or API call.'
      });
    }

    // 2. Unwrapped SVG/Icon buttons with no title/aria-label
    if (line.includes('<button') && !line.includes('aria-label') && !line.includes('title')) {
      if (line.includes('size={') || line.includes('Chevron') || line.includes('Trash') || line.includes('Edit') || line.includes('Refresh')) {
        if (!line.includes('>Cancel') && !line.includes('>Save') && !line.includes('>Update') && !line.includes('>Delete')) {
          detailedFlaws.push({
            file: relPath,
            line: lineNum,
            title: 'Icon Button Missing Tooltip / ARIA Label',
            snippet: line.trim(),
            fix: 'Add title and aria-label attributes.'
          });
        }
      }
    }

    // 3. Textarea without id or label
    if (line.includes('<textarea') && !line.includes('id=') && !line.includes('aria-label') && !line.includes('name=')) {
      detailedFlaws.push({
        file: relPath,
        line: lineNum,
        title: 'Textarea Missing Form ID / ARIA Label',
        snippet: line.trim(),
        fix: 'Add id, name, and aria-label.'
      });
    }

    // 4. Select dropdown without id or label
    if (line.includes('<select') && !line.includes('id=') && !line.includes('aria-label') && !line.includes('name=')) {
      detailedFlaws.push({
        file: relPath,
        line: lineNum,
        title: 'Select Dropdown Missing ARIA Label',
        snippet: line.trim(),
        fix: 'Add id, name, and aria-label.'
      });
    }

    // 5. Cursor pointer on spans/divs with no onClick
    if ((line.includes('cursor-pointer') || line.includes('cursor: \'pointer\'')) && !line.includes('onClick') && !line.includes('<button') && !line.includes('<a') && !line.includes('label') && !line.includes('input')) {
      if (!line.includes('flex justify-between') && !line.includes('onChange')) {
        detailedFlaws.push({
          file: relPath,
          line: lineNum,
          title: 'Fake Clickable Element (cursor-pointer with no onClick)',
          snippet: line.trim(),
          fix: 'Attach onClick handler or remove cursor-pointer class.'
        });
      }
    }
  });
});

console.log(`\n======================================================`);
console.log(`🔍 DEEP FRONTEND FLAWS DETECTED: ${detailedFlaws.length} ISSUES`);
console.log(`======================================================\n`);

detailedFlaws.forEach((flaw, i) => {
  console.log(`[#${i + 1}] ${flaw.title}`);
  console.log(`    File: dashboard/src/app/${flaw.file}:${flaw.line}`);
  console.log(`    Code: "${flaw.snippet}"`);
  console.log(`    Fix: ${flaw.fix}\n`);
});

fs.writeFileSync(path.resolve(__dirname, 'deep_flaws_report.json'), JSON.stringify(detailedFlaws, null, 2));
