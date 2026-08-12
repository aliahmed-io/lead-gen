// @ts-nocheck
/**
 * @module exporter
 * @description Export the full leads database to a formatted Excel
 * workbook and print a detailed summary to the console.
 */

const XLSX = require('xlsx');
const { errOf } = require('./utils');
const path = require('path');
const { OUTPUT_FILE } = require('./config');

/* ------------------------------------------------------------------ */
/*  Excel export                                                      */
/* ------------------------------------------------------------------ */

/**
 * Write all lead records to an Excel (.xlsx) workbook.
 *
 * Rows are sorted by rating descending; businesses without a rating
 * appear last. Additional columns include Price Level, Category,
 * Social Links, and Description beyond the base spec.
 *
 * @param {Array<Object>} leads
 * @returns {string} Absolute path to the generated file.
 */
function exportToExcel(leads) {
  const sorted = [...leads].sort((a, b) => {
    const rA = typeof a.rating === 'number' ? a.rating : -1;
    const rB = typeof b.rating === 'number' ? b.rating : -1;
    return rB - rA;
  });

  const scrapedDate = new Date().toISOString().split('T')[0];

  const rows = sorted.map((l) => {
    /* Flatten social links into a readable string */
    let socials = '';
    if (l.socialLinks && typeof l.socialLinks === 'object') {
      socials = Object.entries(l.socialLinks)
        .map(([k, v]) => `${k}: ${v}`)
        .join(' | ');
    }

    return {
      'Business Name': l.name || '',
      Email: l.email || '',
      Website: l.website || '',
      Phone: l.phone || '',
      City: l.city || '',
      State: l.state || '',
      Rating: typeof l.rating === 'number' ? l.rating : '',
      Reviews: typeof l.reviews === 'number' ? l.reviews : '',
      Platform: l.platform || '',
      Category: l.category || '',
      'Price Level': l.priceLevel || '',
      'Social Links': socials,
      Description: (l.description || '').slice(0, 300),
      'Maps URL': l.mapsUrl || '',
      'Scraped Date': scrapedDate,
    };
  });

  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.json_to_sheet(rows);

  worksheet['!cols'] = [
    { wch: 38 }, // Business Name
    { wch: 32 }, // Email
    { wch: 38 }, // Website
    { wch: 18 }, // Phone
    { wch: 22 }, // City
    { wch: 8 },  // State
    { wch: 8 },  // Rating
    { wch: 10 }, // Reviews
    { wch: 14 }, // Platform
    { wch: 24 }, // Category
    { wch: 10 }, // Price Level
    { wch: 50 }, // Social Links
    { wch: 50 }, // Description
    { wch: 55 }, // Maps URL
    { wch: 14 }, // Scraped Date
  ];

  XLSX.utils.book_append_sheet(workbook, worksheet, 'Leads');

  const outputPath = path.resolve(OUTPUT_FILE);
  try {
    XLSX.writeFile(workbook, outputPath);
  } catch (err) {
    if (err.code === 'EBUSY') {
      console.warn(`\n\u26A0\uFE0F  Warning: Could not save to Excel because '${OUTPUT_FILE}' is currently open in another program (like Excel). Please close it to allow saving.`);
    } else {
      console.error(`\n\u274C Error saving to Excel: ${errOf(err).message}`);
    }
  }

  return outputPath;
}

/* ------------------------------------------------------------------ */
/*  Console summary                                                   */
/* ------------------------------------------------------------------ */

/**
 * Print a formatted summary to stdout with totals, email hit rate,
 * platform and state breakdowns.
 *
 * @param {Array<Object>} leads
 */
function printSummary(leads) {
  const total = leads.length;
  const withEmails = leads.filter(
    (l) => l.email && l.email.length > 0
  ).length;

  const platforms = {};
  const states = {};

  for (const l of leads) {
    const p = l.platform || 'Unknown';
    platforms[p] = (platforms[p] || 0) + 1;

    const s = l.state || 'Unknown';
    states[s] = (states[s] || 0) + 1;
  }

  const bar = '\u2550'.repeat(56);

  console.log(`\n${bar}`);
  console.log('\u{1F4CA} SCRAPING SUMMARY');
  console.log(bar);
  console.log(`   Total businesses in database:  ${total}`);
  console.log(`   Businesses with emails:        ${withEmails}`);
  console.log(`   Businesses without emails:     ${total - withEmails}`);

  if (total > 0) {
    console.log(
      `   Email hit rate:                ${((withEmails / total) * 100).toFixed(1)}%`
    );
  }

  console.log('');
  console.log('   Platform breakdown:');
  for (const [p, c] of Object.entries(platforms).sort(
    (a, b) => b[1] - a[1]
  )) {
    console.log(
      `      ${p.padEnd(18)} ${String(c).padStart(4)}  (${((c / total) * 100).toFixed(1)}%)`
    );
  }

  console.log('');
  console.log('   State breakdown:');
  for (const [s, c] of Object.entries(states).sort(
    (a, b) => b[1] - a[1]
  )) {
    if (s === 'Unknown') continue;
    console.log(
      `      ${s.padEnd(18)} ${String(c).padStart(4)}  (${((c / total) * 100).toFixed(1)}%)`
    );
  }

  console.log(bar);
}

module.exports = { exportToExcel, printSummary };
