const { run } = require('node:test');
const { spec } = require('node:test/reporters');
const path = require('path');

const testFiles = [
  path.join(__dirname, 'tier1.test.js'),
  path.join(__dirname, 'tier2.test.js'),
  path.join(__dirname, 'tier3.test.js'),
  path.join(__dirname, 'tier4.test.js'),
  path.join(__dirname, 'tier5.test.js'),
  path.join(__dirname, 'tier6.test.js')
];

run({ files: testFiles })
  .on('test:fail', () => {
    process.exitCode = 1;
  })
  .compose(new spec())
  .pipe(process.stdout);
