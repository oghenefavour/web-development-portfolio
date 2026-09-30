// Business rules kept in one place so they are easy to change.
module.exports = {
  deliveryFeeKobo: Number(process.env.DELIVERY_FEE_KOBO) || 250000,          // NGN 2,500
  freeDeliveryThresholdKobo: Number(process.env.FREE_DELIVERY_THRESHOLD_KOBO) || 10000000, // NGN 100,000
  maxQuantityPerItem: 50,
  adminApiKey: process.env.ADMIN_API_KEY || '',
};
