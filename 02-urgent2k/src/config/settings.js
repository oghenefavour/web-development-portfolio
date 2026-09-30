module.exports = {
  minBudgetKobo: 200000,              // NGN 2,000: the "2k" in Urgent2k
  platformFeePercent: 10,             // taken from the tasker's payout when a job is confirmed
  jwtSecret: process.env.JWT_SECRET || 'dev-only-secret-change-me',
  jwtExpiresIn: '7d',
};
