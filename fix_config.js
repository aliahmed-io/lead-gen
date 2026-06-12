const fs = require('fs');

const txCities = [
  'Grand Prairie', 'Pasadena', 'Pearland', 'Allen', 'League City', 'Richardson', 
  'Mesquite', 'Carrollton', 'Lewisville', 'New Braunfels', 'Baytown', 'Missouri City', 
  'Mansfield', 'San Marcos', 'Pflugerville', 'Rowlett', 'Euless', 'DeSoto', 
  'Grapevine', 'Bedford', 'Cedar Park', 'Leander', 'Wylie', 'Burleson', 'Rockwall', 
  'Little Elm', 'Keller', 'The Colony', 'Temple', 'Haltom City', 'Hurst', 'Coppell', 
  'Duncanville', 'Lancaster', 'Friendswood', 'Rosenberg', 'Waxahachie', 'Cleburne', 
  'Southlake', 'Farmers Branch', 'Weatherford', 'Greenville', 'Alvin', 'Forney', 
  'Seguin', 'Midlothian', 'Schertz', 'Lufkin', 'Nacogdoches', 'Corsicana',
  'Bryan', 'Huntsville', 'Marshall', 'Paris', 'Denison', 'Sherman', 'Mount Pleasant'
];

const flCities = [
  'Miramar', 'Coral Gables', 'Davie', 'Plantation', 'Sunrise', 'Miami Beach', 
  'Jupiter', 'Deerfield Beach', 'Margate', 'Coconut Creek', 'Wellington', 
  'North Miami', 'Port Orange', 'Apopka', 'Sanford', 'Weston', 'Deltona', 
  'Tamarac', 'Pinellas Park', 'Ocoee', 'Palm Beach Gardens', 'Winter Garden', 
  'Daytona Beach', 'Cutler Bay', 'North Miami Beach', 'Bonita Springs', 
  'Oakland Park', 'Greenacres', 'Altamonte Springs', 'Lake Worth', 'Ormond Beach', 
  'Hallandale Beach', 'Aventura', 'Oviedo', 'Winter Springs', 'Royal Palm Beach', 
  'Riviera Beach', 'Winter Haven', 'Titusville', 'Plant City', 'Dunedin', 
  'Tarpon Springs', 'Coral Springs', 'Boynton Beach', 'Delray Beach', 'Venice',
  'Stuart', 'Vero Beach', 'Sebastian', 'Leesburg', 'Eustis'
];

const ncCities = [
  'Indian Trail', 'Monroe', 'Sanford', 'Matthews', 'New Bern', 'Clemmons', 
  'Lexington', 'Thomasville', 'Holly Springs', 'Fuquay-Varina', 'Garner', 
  'Wake Forest', 'Cornelius', 'Mint Hill', 'Mooresville', 'Hickory', 'Apex', 
  'Burlington', 'Kannapolis', 'Jacksonville', 'Greenville', 'Rocky Mount', 
  'Wilson', 'Goldsboro', 'Salisbury', 'Statesville', 'Shelby', 'Morganton', 
  'Kernersville', 'Hendersonville', 'Kinston', 'Mount Airy', 'Lumberton', 
  'Lenoir', 'Elizabeth City', 'Clayton', 'Carrboro', 'Leland', 'Boone', 'Hope Mills',
  'Pinehurst', 'Southern Pines', 'Havelock', 'Roanoke Rapids', 'Garrison'
];

let queries = [];
function generate(cities, stateCode) {
  cities.forEach(city => {
    queries.push(`  'furniture store ${city} ${stateCode}',`);
    queries.push(`  'home decor store ${city} ${stateCode}',`);
  });
}
generate(txCities, 'TX');
generate(flCities, 'FL');
generate(ncCities, 'NC');
const queryStr = queries.join('\r\n');

let config = fs.readFileSync('config.js', 'utf8');

config = config.replace(
  /'home decor store Chapel Hill NC',\r?\n\];/g, 
  "'home decor store Chapel Hill NC',\r\n" + queryStr + "\r\n];"
);

fs.writeFileSync('config.js', config, 'utf8');
console.log('Fixed config.js');
