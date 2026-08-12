const fs = require('fs');
const path = require('path');

const dbPath = path.resolve(__dirname, '../leads_db.json');
const data = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
const businesses = Object.values(data.businesses || {});

const furnitureLeads = businesses.filter(b => b.niche === 'Home Decor & Furniture' || b.niche === 'Custom Lighting & Woodwork');

const stateCounts = {};
const cityCounts = {};

furnitureLeads.forEach(b => {
  const st = b.state || 'Unknown';
  const c = b.city ? `${b.city}, ${st}` : `Unknown, ${st}`;
  stateCounts[st] = (stateCounts[st] || 0) + 1;
  cityCounts[c] = (cityCounts[c] || 0) + 1;
});

console.log(`\n======================================================`);
console.log(`📊 EXACT LOCATION BREAKDOWN OF CURRENT FURNITURE E-COMMERCE LEADS`);
console.log(`======================================================`);
console.log(`  Total Furniture E-Commerce Leads: ${furnitureLeads.length.toLocaleString()}\n`);

console.log(`📍 STATE BREAKDOWN:`);
Object.entries(stateCounts).forEach(([st, cnt]) => {
  console.log(`   • ${st} : ${cnt.toLocaleString()} leads (${((cnt / furnitureLeads.length) * 100).toFixed(1)}%)`);
});

console.log(`\n🌆 CITY BREAKDOWN:`);
Object.entries(cityCounts).forEach(([c, cnt]) => {
  console.log(`   • ${c} : ${cnt.toLocaleString()} leads`);
});
console.log(`======================================================\n`);
