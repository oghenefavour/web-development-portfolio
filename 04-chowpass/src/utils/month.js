const HttpError = require('./httpError');
const clock = require('./clock');

// Parses ?month=YYYY-MM (defaults to the current Lagos month) into a date range.
function monthRange(value) {
  const month = value || clock.lagos().month;
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new HttpError(400, 'month must look like YYYY-MM');
  const [y, m] = month.split('-').map(Number);
  const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
  return { month, start: `${month}-01`, end: `${next}-01` };
}

module.exports = { monthRange };
