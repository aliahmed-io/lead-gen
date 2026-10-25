'use strict';
require('./runtime/bootstrap').ensure();
module.exports={...require('./runtime/api'),auth:require('./runtime/auth'),store:require('./runtime/store'),leads:require('./runtime/leads'),delivery:require('./runtime/delivery'),models:require('./runtime/models')};
