const Holidays = require('date-holidays');

// Initialize holidays for United States, specifically Texas
const hd = new Holidays('US', 'TX');

/**
 * Checks if the current time is within Texas business hours (9AM - 5PM CT).
 * Automatically excludes Weekends and US Public Holidays.
 * 
 * Returns: { valid: boolean, reason?: string }
 */
function isWithinBusinessHours() {
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
  
  const hour = parseInt(parts.find(p => p.type === 'hour').value, 10);
  const weekday = parts.find(p => p.type === 'weekday').value;
  const year = parts.find(p => p.type === 'year').value;
  const month = parts.find(p => p.type === 'month').value;
  const day = parts.find(p => p.type === 'day').value;
  
  // 1. Weekend Check
  if (weekday === 'Sat' || weekday === 'Sun') {
    return { valid: false, reason: `Weekend (${weekday})` };
  }
  
  // 2. Holiday Check
  // Note: formatting to YYYY-MM-DD ensures clean timezone matching for the holiday library
  const dateStr = `${year}-${month}-${day} 12:00:00`;
  const holidayObj = hd.isHoliday(new Date(dateStr));
  
  if (holidayObj && holidayObj.some(h => h.type === 'public')) {
    const holidayName = holidayObj.find(h => h.type === 'public').name;
    return { valid: false, reason: `Public Holiday (${holidayName})` };
  }
  
  // 3. Hours Check (9:00 AM - 4:59 PM)
  if (hour < 9 || hour >= 17) {
    return { valid: false, reason: `Outside business hours (${hour}:00 CT)` };
  }
  
  return { valid: true };
}

module.exports = { isWithinBusinessHours };
