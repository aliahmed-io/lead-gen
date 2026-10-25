require('./runtime/bootstrap').ensure();
module.exports={runPreflightAndSimulation:require('./runtime/analytics').preflight};
