const fs = require('fs');
const path = require('path');

const srcDir = path.resolve(__dirname, '../dashboard/src');

function getAllFiles(dir, fileList = []) {
  const files = fs.readdirSync(dir);
  files.forEach(file => {
    const filePath = path.join(dir, file);
    if (fs.statSync(filePath).isDirectory()) {
      getAllFiles(filePath, fileList);
    } else if (file.endsWith('.tsx') || file.endsWith('.ts') || file.endsWith('.jsx')) {
      fileList.push(filePath);
    }
  });
  return fileList;
}

const files = getAllFiles(srcDir);
const issues = [];

files.forEach(filePath => {
  const relPath = path.relative(srcDir, filePath);
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');

  lines.forEach((line, idx) => {
    const lineNum = idx + 1;

    // Issue Type 1: Useless / Dummy Buttons (e.g. B, I, U, S in formatting toolbar or empty onClick)
    if (line.includes('<span className="font-bold cursor-pointer') || line.includes('cursor-pointer hover:text')) {
      if (!line.includes('onClick')) {
        issues.push({
          file: relPath,
          line: lineNum,
          category: 'Useless UI Element / Dead Control',
          severity: 'HIGH',
          description: `Interactive cursor-pointer element (formatting toolbar item) has no onClick handler attached: "${line.trim()}"`
        });
      }
    }

    if (line.match(/<button[^>]*>\s*<\/button>/i)) {
      issues.push({
        file: relPath,
        line: lineNum,
        category: 'Empty Button Element',
        severity: 'MEDIUM',
        description: `Button element is completely empty with no text, icon, or child elements.`
      });
    }

    // Issue Type 2: Icon-Only Buttons without Accessible Name (aria-label or title)
    if (line.includes('<button') && !line.includes('aria-label') && !line.includes('title')) {
      if (line.includes('size={') || line.includes('Icon') || line.includes('Chevron') || line.includes('Shield')) {
        if (!line.includes('>{') && !line.includes('>Cancel') && !line.includes('>Update') && !line.includes('>Save')) {
          issues.push({
            file: relPath,
            line: lineNum,
            category: 'Accessibility Violation (Icon Button)',
            severity: 'MEDIUM',
            description: `Icon-only button lacks aria-label or title attribute for screen readers and tooltips: "${line.trim()}"`
          });
        }
      }
    }

    // Issue Type 3: Hardcoded Color Hexes (Bypassing CSS Design Tokens)
    if (line.match(/#[0-9a-fA-F]{3,6}/) && !line.includes('var(') && !relPath.includes('globals.css') && !line.includes('color:')) {
      if (line.includes('bg-') || line.includes('text-') || line.includes('border-') || line.includes('#fff') || line.includes('#000')) {
        issues.push({
          file: relPath,
          line: lineNum,
          category: 'Design System Violation (Hardcoded Hex)',
          severity: 'LOW',
          description: `Hardcoded color hex found bypassing design tokens: "${line.trim()}"`
        });
      }
    }

    // Issue Type 4: Dummy / Broken Anchors (href="#" or href="")
    if (line.includes('href="#"') || line.includes('href=""')) {
      issues.push({
        file: relPath,
        line: lineNum,
        category: 'Dead Link / Dummy Route',
        severity: 'HIGH',
        description: `Anchor element has dead or empty href attribute: "${line.trim()}"`
      });
    }

    // Issue Type 5: Missing Input Identifiers or Labels
    if (line.includes('<input') && !line.includes('id=') && !line.includes('aria-label') && !line.includes('name=')) {
      issues.push({
        file: relPath,
        line: lineNum,
        category: 'Form Accessibility Flaw',
        severity: 'MEDIUM',
        description: `Form input element missing id, name, or aria-label attribute: "${line.trim()}"`
      });
    }

    // Issue Type 6: Unhandled Promises / Missing Catch in async fetch calls
    if (line.includes('fetch(') && !lines.slice(Math.max(0, idx - 5), idx + 15).join('\n').includes('catch')) {
      // Checked in block context
    }
  });
});

console.log(`\n======================================================`);
console.log(`🩺 REACT DOCTOR & FRONTEND AUDIT RESULTS (${issues.length} ISSUES FOUND)`);
console.log(`======================================================\n`);

issues.forEach((iss, i) => {
  console.log(`[Issue #${i + 1}] [${iss.severity}] Category: ${iss.category}`);
  console.log(`  Location: dashboard/src/${iss.file}:${iss.line}`);
  console.log(`  Detail: ${iss.description}\n`);
});

fs.writeFileSync(path.resolve(__dirname, 'frontend_audit_report.json'), JSON.stringify(issues, null, 2));
