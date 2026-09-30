// A tiny clock wrapper so tests can "freeze" time (e.g. to lunchtime) and check meal windows.
const { lagosOffsetMinutes } = require('../config/settings');

let fixedNow = null;
const now = () => (fixedNow ? new Date(fixedNow) : new Date());
const setNow = (date) => { fixedNow = date ? new Date(date) : null; };

// Returns the Lagos calendar date (YYYY-MM-DD), month (YYYY-MM) and minutes after midnight.
function lagos(date = now()) {
  const local = new Date(date.getTime() + lagosOffsetMinutes * 60000);
  const iso = local.toISOString();
  return { date: iso.slice(0, 10), month: iso.slice(0, 7), minutes: local.getUTCHours() * 60 + local.getUTCMinutes() };
}

// Converts "YYYY-MM-DD" + minutes-after-midnight in Lagos into a UTC "YYYY-MM-DD HH:MM:SS" string for MySQL.
function lagosToUtcSql(dateStr, minutes) {
  const utc = new Date(`${dateStr}T00:00:00Z`).getTime() + (minutes - lagosOffsetMinutes) * 60000;
  return new Date(utc).toISOString().slice(0, 19).replace('T', ' ');
}

const toSql = (date) => date.toISOString().slice(0, 19).replace('T', ' ');

module.exports = { now, setNow, lagos, lagosToUtcSql, toSql };
