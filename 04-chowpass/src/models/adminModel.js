const pool = require('../config/db');
const { toNaira } = require('../utils/money');

/** Platform view: what each company owes (premiums) and what each restaurant is owed (meals served). */
async function overview(range) {
  const [companies] = await pool.query(
    `SELECT c.id, c.name, p.name AS package_name, p.monthly_premium_kobo,
            (SELECT COUNT(*) FROM users u WHERE u.company_id = c.id AND u.role = 'staff' AND u.is_active = 1) AS active_staff,
            (SELECT COUNT(*) FROM meal_codes mc WHERE mc.company_id = c.id AND mc.redeemed_at IS NOT NULL AND mc.meal_date >= ? AND mc.meal_date < ?) AS meals,
            (SELECT COALESCE(SUM(value_kobo),0) FROM meal_codes mc WHERE mc.company_id = c.id AND mc.redeemed_at IS NOT NULL AND mc.meal_date >= ? AND mc.meal_date < ?) AS meal_cost
       FROM companies c JOIN packages p ON p.id = c.package_id ORDER BY c.name`,
    [range.start, range.end, range.start, range.end],
  );
  const [restaurants] = await pool.query(
    `SELECT r.id, r.name, r.city, COUNT(mc.id) AS meals, COALESCE(SUM(mc.value_kobo),0) AS owed
       FROM restaurants r LEFT JOIN meal_codes mc ON mc.restaurant_id = r.id AND mc.meal_date >= ? AND mc.meal_date < ?
      GROUP BY r.id ORDER BY owed DESC, r.name`,
    [range.start, range.end],
  );
  const receivable = companies.reduce((s, c) => s + Number(c.active_staff) * c.monthly_premium_kobo, 0);
  const payable = restaurants.reduce((s, r) => s + Number(r.owed), 0);
  return {
    month: range.month,
    totals: {
      premiumsReceivable: toNaira(receivable),
      restaurantPayable: toNaira(payable),
      margin: toNaira(receivable - payable),
      mealsServed: restaurants.reduce((s, r) => s + Number(r.meals), 0),
    },
    companies: companies.map((c) => ({
      name: c.name, package: c.package_name, activeStaff: Number(c.active_staff),
      invoice: toNaira(Number(c.active_staff) * c.monthly_premium_kobo), meals: Number(c.meals), mealCost: toNaira(Number(c.meal_cost)),
    })),
    restaurants: restaurants.map((r) => ({ name: r.name, city: r.city, meals: Number(r.meals), owed: toNaira(Number(r.owed)) })),
  };
}

module.exports = { overview };
