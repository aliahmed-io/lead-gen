const Holidays = require('date-holidays');

// Initialize holidays for United States, specifically Texas
const hd = new Holidays('US', 'TX');

/**
 * Checks if the current time is within Texas business hours (9AM - 5PM CT).
 * Automatically excludes Weekends and US Public Holidays.
 * 
 * Returns: { valid: boolean, reason?: string }
 */
/**
 * @param {number} [startHour]
 * @param {number} [endHour]
 */
function isWithinBusinessHours(startHour = 9, endHour = 17) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    hour: 'numeric',
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour12: false
  });
  
  const parts = formatter.formatToParts(new Date());
  
  const hour = parseInt(/** @type {string} */ (parts.find(p => p.type === 'hour')?.value ?? ''), 10);
  const weekday = /** @type {string} */ (parts.find(p => p.type === 'weekday')?.value ?? '');
  const year = /** @type {string} */ (parts.find(p => p.type === 'year')?.value ?? '');
  const month = /** @type {string} */ (parts.find(p => p.type === 'month')?.value ?? '');
  const day = /** @type {string} */ (parts.find(p => p.type === 'day')?.value ?? '');
  
  // 1. Weekend Check
  if (weekday === 'Sat' || weekday === 'Sun') {
    return { valid: false, reason: `Weekend (${weekday})` };
  }
  
  // 2. Holiday Check
  // Note: formatting to YYYY-MM-DD ensures clean timezone matching for the holiday library
  const dateStr = `${year}-${month}-${day} 12:00:00`;
  const holidayObj = /** @type {Array<{ type?: string; name?: string }> | false} */ (hd.isHoliday(new Date(dateStr)));
  
  if (holidayObj && holidayObj.some(h => h.type === 'public')) {
    const holidayName = /** @type {string} */ (holidayObj.find(h => h.type === 'public')?.name);
    return { valid: false, reason: `Public Holiday (${holidayName})` };
  }
  
  // 3. Hours Check
  if (hour < startHour || hour >= endHour) {
    return { valid: false, reason: `Outside business hours (${hour}:00 CT)` };
  }
  
  return { valid: true };
}

/**
 * Checks if current time is a weekday (Mon-Fri) in Central Time.
 */
/** */
function isWeekday() {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    weekday: 'short',
  });
  const weekday = formatter.format(new Date());
  return weekday !== 'Sat' && weekday !== 'Sun';
}

/**
 * Calculates remaining milliseconds until Midnight Central Time (daily reset clock).
 */
function getTimeUntilMidnight() {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    hour12: false,
  });
  const parts = formatter.formatToParts(new Date());
  const hour = parseInt(/** @type {string} */ (parts.find(p => p.type === 'hour')?.value ?? ''), 10);
  const minute = parseInt(/** @type {string} */ (parts.find(p => p.type === 'minute')?.value ?? ''), 10);
  const second = parseInt(/** @type {string} */ (parts.find(p => p.type === 'second')?.value ?? ''), 10);

  const secondsPassed = hour * 3600 + minute * 60 + second;
  const secondsInDay = 86400;
  return (secondsInDay - secondsPassed) * 1000;
}

module.exports = { isWithinBusinessHours, isWeekday, getTimeUntilMidnight };
