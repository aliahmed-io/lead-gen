'use strict';

/**
 * Centralized Configuration Management System
 * Single source of truth for deliverability thresholds, scheduling,
 * lead scoring weights, tracking security, and system defaults.
 */

const CONFIG = {
  deliverability: {
    maxBounceRate: 0.04,          // 4.0% bounce rate triggers circuit breaker
    warningBounceRate: 0.02,      // 2.0% triggers warning state
    maxEmailsPerDayPerAccount: 30,// Default daily limit per mailbox
    softBounceThreshold: 3,       // 3 strikes before marking lead bounced
    smtpPingTimeoutMs: 10000,     // 10s SMTP ping timeout
  },

  schedule: {
    startHourCT: 9,               // 9 AM Central Time
    endHourCT: 17,                // 5 PM Central Time
    timezone: 'America/Chicago',  // Default Central Time
    allowWeekends: false,         // Mon-Fri sending by default
    gaussianMinDelayMs: 180000,   // 3 minutes min delay
    gaussianMaxDelayMs: 480000,   // 8 minutes max delay
  },

  scoring: {
    weights: {
      opportunity: 0.35,          // 35% weight
      business: 0.30,             // 30% weight
      technical: 0.20,            // 20% weight
      deliverability: 0.15,       // 15% weight
    },
    thresholds: {
      highPriority: 80,
      mediumPriority: 60,
    }
  },

  suppression: {
    cooldownDays: 90,             // 90-day global email & domain cooldown
  },

  tracking: {
    tokenExpirationHours: 720,    // 30 days unsubscribe token validity
  }
};

module.exports = CONFIG;
