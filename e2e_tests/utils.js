// Legacy helpers cannot overwrite project data. New tests use isolated temporary SQLite stores.
module.exports={withTempDb(){throw new Error('Legacy destructive fixture disabled; use npm test');},withTempEnv(){throw new Error('Legacy destructive fixture disabled; use npm test');},runCommand(){throw new Error('Legacy execution disabled; use npm test');}};
