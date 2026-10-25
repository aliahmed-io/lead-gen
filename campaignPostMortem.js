require('./runtime/bootstrap').ensure();
module.exports={generatePostMortem:require('./runtime/analytics').postmortem};
