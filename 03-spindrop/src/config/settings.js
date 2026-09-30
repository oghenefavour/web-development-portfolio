module.exports = {
  pickupDeliveryFeeKobo: 200000,     // NGN 2,000 for laundry pickup + return delivery
  riderPayoutPerLegKobo: 80000,      // NGN 800 per pickup or delivery trip
  expressSurchargePercent: 50,       // express laundry (24h) costs 50% more
  providerSharePercent: 80,          // cleaners and movers keep 80% of the service price
  maxRooms: 10,
  maxItemQuantity: 50,
  jwtSecret: process.env.JWT_SECRET || 'dev-only-secret-change-me',
  jwtExpiresIn: '7d',
};
