require('child_process').spawnSync(process.execPath,['--experimental-sqlite','--test','tests/core.test.cjs'],{cwd:require('path').resolve(__dirname,'..'),stdio:'inherit'});
