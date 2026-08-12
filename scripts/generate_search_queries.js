const fs = require('fs');
const path = require('path');

// Complete 50-State Comprehensive US Cities Database (~300+ Cities)
const STATES = [
  { code: 'AL', name: 'Alabama', cities: ['Birmingham', 'Montgomery', 'Huntsville', 'Mobile', 'Tuscaloosa'] },
  { code: 'AK', name: 'Alaska', cities: ['Anchorage', 'Fairbanks', 'Juneau'] },
  { code: 'AZ', name: 'Arizona', cities: ['Phoenix', 'Tucson', 'Mesa', 'Chandler', 'Scottsdale', 'Glendale', 'Gilbert', 'Tempe'] },
  { code: 'AR', name: 'Arkansas', cities: ['Little Rock', 'Fort Smith', 'Fayetteville', 'Springdale'] },
  { code: 'CA', name: 'California', cities: ['Los Angeles', 'San Francisco', 'San Diego', 'San Jose', 'Sacramento', 'Fresno', 'Long Beach', 'Oakland', 'Bakersfield', 'Anaheim', 'Santa Ana', 'Riverside', 'Irvine'] },
  { code: 'CO', name: 'Colorado', cities: ['Denver', 'Colorado Springs', 'Aurora', 'Fort Collins', 'Lakewood', 'Boulder'] },
  { code: 'CT', name: 'Connecticut', cities: ['Bridgeport', 'Stamford', 'New Haven', 'Hartford', 'Waterbury'] },
  { code: 'DE', name: 'Delaware', cities: ['Wilmington', 'Dover', 'Newark'] },
  { code: 'FL', name: 'Florida', cities: ['Miami', 'Orlando', 'Tampa', 'Jacksonville', 'Fort Lauderdale', 'St. Petersburg', 'Tallahassee', 'Boca Raton', 'Sarasota', 'Naples'] },
  { code: 'GA', name: 'Georgia', cities: ['Atlanta', 'Savannah', 'Augusta', 'Columbus', 'Macon', 'Athens'] },
  { code: 'HI', name: 'Hawaii', cities: ['Honolulu', 'Hilo', 'Kailua'] },
  { code: 'ID', name: 'Idaho', cities: ['Boise', 'Meridian', 'Nampa', 'Idaho Falls'] },
  { code: 'IL', name: 'Illinois', cities: ['Chicago', 'Aurora', 'Naperville', 'Joliet', 'Rockford', 'Springfield'] },
  { code: 'IN', name: 'Indiana', cities: ['Indianapolis', 'Fort Wayne', 'Evansville', 'South Bend', 'Carmel'] },
  { code: 'IA', name: 'Iowa', cities: ['Des Moines', 'Cedar Rapids', 'Davenport', 'Sioux City'] },
  { code: 'KS', name: 'Kansas', cities: ['Wichita', 'Overland Park', 'Kansas City', 'Olathe', 'Topeka'] },
  { code: 'KY', name: 'Kentucky', cities: ['Louisville', 'Lexington', 'Bowling Green', 'Owensboro'] },
  { code: 'LA', name: 'Louisiana', cities: ['New Orleans', 'Baton Rouge', 'Shreveport', 'Lafayette'] },
  { code: 'ME', name: 'Maine', cities: ['Portland', 'Lewiston', 'Bangor'] },
  { code: 'MD', name: 'Maryland', cities: ['Baltimore', 'Frederick', 'Rockville', 'Gaithersburg', 'Annapolis'] },
  { code: 'MA', name: 'Massachusetts', cities: ['Boston', 'Worcester', 'Springfield', 'Cambridge', 'Lowell'] },
  { code: 'MI', name: 'Michigan', cities: ['Detroit', 'Grand Rapids', 'Warren', 'Sterling Heights', 'Ann Arbor'] },
  { code: 'MN', name: 'Minnesota', cities: ['Minneapolis', 'St. Paul', 'Rochester', 'Duluth', 'Bloomington'] },
  { code: 'MS', name: 'Mississippi', cities: ['Jackson', 'Gulfport', 'Southaven', 'Biloxi'] },
  { code: 'MO', name: 'Missouri', cities: ['Kansas City', 'St. Louis', 'Springfield', 'Columbia', 'Independence'] },
  { code: 'MT', name: 'Montana', cities: ['Billings', 'Missoula', 'Great Falls', 'Bozeman'] },
  { code: 'NE', name: 'Nebraska', cities: ['Omaha', 'Lincoln', 'Bellevue', 'Grand Island'] },
  { code: 'NV', name: 'Nevada', cities: ['Las Vegas', 'Henderson', 'Reno', 'North Las Vegas'] },
  { code: 'NH', name: 'New Hampshire', cities: ['Manchester', 'Nashua', 'Concord'] },
  { code: 'NJ', name: 'New Jersey', cities: ['Newark', 'Jersey City', 'Paterson', 'Elizabeth', 'Trenton'] },
  { code: 'NM', name: 'New Mexico', cities: ['Albuquerque', 'Las Cruces', 'Rio Rancho', 'Santa Fe'] },
  { code: 'NY', name: 'New York', cities: ['New York', 'Buffalo', 'Rochester', 'Yonkers', 'Syracuse', 'Albany', 'Brooklyn', 'Queens', 'Manhattan'] },
  { code: 'NC', name: 'North Carolina', cities: ['Charlotte', 'Raleigh', 'Greensboro', 'Durham', 'Winston-Salem', 'Fayetteville', 'Asheville'] },
  { code: 'ND', name: 'North Dakota', cities: ['Fargo', 'Bismarck', 'Grand Forks'] },
  { code: 'OH', name: 'Ohio', cities: ['Columbus', 'Cleveland', 'Cincinnati', 'Toledo', 'Akron', 'Dayton'] },
  { code: 'OK', name: 'Oklahoma', cities: ['Oklahoma City', 'Tulsa', 'Norman', 'Broken Arrow'] },
  { code: 'OR', name: 'Oregon', cities: ['Portland', 'Salem', 'Eugene', 'Gresham', 'Hillsboro'] },
  { code: 'PA', name: 'Pennsylvania', cities: ['Philadelphia', 'Pittsburgh', 'Allentown', 'Erie', 'Reading'] },
  { code: 'RI', name: 'Rhode Island', cities: ['Providence', 'Warwick', 'Cranston'] },
  { code: 'SC', name: 'South Carolina', cities: ['Charleston', 'Columbia', 'North Charleston', 'Greenville'] },
  { code: 'SD', name: 'South Dakota', cities: ['Sioux Falls', 'Rapid City'] },
  { code: 'TN', name: 'Tennessee', cities: ['Nashville', 'Memphis', 'Knoxville', 'Chattanooga', 'Clarksville'] },
  { code: 'TX', name: 'Texas', cities: ['Houston', 'San Antonio', 'Dallas', 'Austin', 'Fort Worth', 'El Paso', 'Arlington', 'Corpus Christi', 'Plano', 'Lubbock'] },
  { code: 'UT', name: 'Utah', cities: ['Salt Lake City', 'West Valley City', 'Provo', 'West Jordan', 'Orem'] },
  { code: 'VT', name: 'Vermont', cities: ['Burlington', 'South Burlington', 'Rutland'] },
  { code: 'VA', name: 'Virginia', cities: ['Virginia Beach', 'Chesapeake', 'Norfolk', 'Richmond', 'Alexandria', 'Roanoke'] },
  { code: 'WA', name: 'Washington', cities: ['Seattle', 'Spokane', 'Tacoma', 'Vancouver', 'Bellevue'] },
  { code: 'WV', name: 'West Virginia', cities: ['Charleston', 'Huntington', 'Morgantown'] },
  { code: 'WI', name: 'Wisconsin', cities: ['Milwaukee', 'Madison', 'Green Bay', 'Kenosha'] },
  { code: 'WY', name: 'Wyoming', cities: ['Cheyenne', 'Casper', 'Laramie'] }
];

// Halal & Modest E-commerce Store Types (STRICTLY NO FURNITURE, CLOTHING MODELING, BIKINIS, OR MAKEUP)
const HALAL_STORE_TYPES = [
  'leather footwear store',
  'custom boots boutique',
  'artisan shoe workshop',
  'luxury watch store',
  'timepiece boutique',
  'leather bag shop',
  'handbag workshop',
  'eyewear optical store',
  'custom sunglasses boutique',
  'artisan hat shop',
  'headwear store',
  'fine jewelry store',
  'artisan goldsmith shop',
  'gourmet coffee roaster shop',
  'chef cutlery store',
  'leather tech accessories shop'
];

function generateSearchQueries() {
  const queries = [];
  let cityCount = 0;

  STATES.forEach(st => {
    st.cities.forEach(city => {
      cityCount++;
      HALAL_STORE_TYPES.forEach(type => {
        queries.push({
          query: `${type} ${city} ${st.code}`,
          storeType: type,
          city: city,
          state: st.code,
          stateName: st.name
        });
      });
    });
  });

  return { queries, cityCount };
}

const { queries: allQueries, cityCount } = generateSearchQueries();
const jsonPath = path.resolve(__dirname, '../search_queries.json');

fs.writeFileSync(jsonPath, JSON.stringify({
  metadata: {
    totalQueries: allQueries.length,
    statesCovered: 50,
    uniqueCitiesCount: cityCount,
    storeTypesCount: HALAL_STORE_TYPES.length,
    furnitureExcluded: true,
    halalCompliant: true,
    generatedAt: new Date().toISOString()
  },
  storeTypes: HALAL_STORE_TYPES,
  queries: allQueries
}, null, 2), 'utf8');

console.log(`\n======================================================`);
console.log(`✅ EXPANDED SEARCH QUERIES LIST GENERATED (ALL 50 STATES)`);
console.log(`======================================================`);
console.log(`  🔍 Total Scraper Queries : ${allQueries.length.toLocaleString()}`);
console.log(`  🏙️ Total US Cities       : ${cityCount} Cities across 50 States`);
console.log(`  🛍️ Halal Store Types     : ${HALAL_STORE_TYPES.length} Categories (Furniture Excluded)`);
console.log(`  ----------------------------------------------------`);
console.log(`  📁 Saved to: ${jsonPath}\n`);
