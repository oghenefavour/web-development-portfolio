module.exports = {
  // Meal windows in Lagos time (minutes after midnight).
  windows: {
    lunch: { start: 11 * 60, end: 16 * 60, label: '11:00 am – 4:00 pm' },
    dinner: { start: 17 * 60, end: 21 * 60, label: '5:00 pm – 9:00 pm' },
  },
  lagosOffsetMinutes: 60,              // Nigeria is UTC+1 all year (no daylight saving)
  jwtSecret: process.env.JWT_SECRET || 'dev-only-secret-change-me',
  jwtExpiresIn: '7d',
};
