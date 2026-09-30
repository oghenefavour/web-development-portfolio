const pool = require('../config/db');
const HttpError = require('../utils/httpError');
const { toNaira } = require('../utils/money');
const { platformFeePercent } = require('../config/settings');

const BASE_SELECT = `
  SELECT t.*, c.name AS category_name, c.slug AS category_slug, c.icon AS category_icon,
         cu.full_name AS customer_name, tk.full_name AS tasker_name, tk.phone AS tasker_phone,
         cu.phone AS customer_phone,
         (SELECT COUNT(*) FROM offers o WHERE o.task_id = t.id AND o.status = 'pending') AS offer_count
    FROM tasks t
    JOIN categories c ON c.id = t.category_id
    JOIN users cu ON cu.id = t.customer_id
    LEFT JOIN users tk ON tk.id = t.assigned_tasker_id`;

// viewer decides what is visible: the full address and phone numbers are only
// shared between the customer and the tasker once the job is assigned.
function format(t, viewer) {
  const isOwner = viewer && viewer.id === t.customer_id;
  const isAssigned = viewer && viewer.id === t.assigned_tasker_id;
  const task = {
    id: t.id,
    title: t.title,
    description: t.description,
    category: { name: t.category_name, slug: t.category_slug, icon: t.category_icon },
    city: t.city,
    area: t.area,
    budget: toNaira(t.budget_kobo),
    isUrgent: Boolean(t.is_urgent),
    scheduledFor: t.scheduled_for,
    status: t.status,
    offerCount: Number(t.offer_count),
    postedBy: t.customer_name.split(' ')[0],
    createdAt: t.created_at,
  };
  if (isOwner || isAssigned) {
    task.address = t.address;
    task.agreedPrice = toNaira(t.agreed_price_kobo);
    if (t.assigned_tasker_id) task.tasker = { id: t.assigned_tasker_id, name: t.tasker_name, phone: t.tasker_phone };
  }
  if (isAssigned) {
    task.customer = { name: t.customer_name, phone: t.customer_phone };
    task.yourPayout = toNaira(t.tasker_payout_kobo);
  }
  if (isOwner) {
    task.platformFee = toNaira(t.platform_fee_kobo);
  }
  return task;
}

async function create(customerId, data) {
  const [cat] = await pool.query('SELECT id FROM categories WHERE id = ?', [data.categoryId]);
  if (!cat.length) throw new HttpError(400, 'categoryId does not exist');
  const [res] = await pool.query(
    `INSERT INTO tasks (customer_id, category_id, title, description, city, area, address, budget_kobo, is_urgent, scheduled_for)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [customerId, data.categoryId, data.title, data.description, data.city, data.area, data.address,
      data.budgetKobo, data.isUrgent ? 1 : 0, data.scheduledFor],
  );
  return getById(res.insertId, { id: customerId });
}

async function getRaw(id, conn = pool, lock = false) {
  const [rows] = await conn.query(`SELECT * FROM tasks WHERE id = ?${lock ? ' FOR UPDATE' : ''}`, [id]);
  if (!rows.length) throw new HttpError(404, 'Task not found');
  return rows[0];
}

async function getById(id, viewer) {
  const [rows] = await pool.query(`${BASE_SELECT} WHERE t.id = ?`, [id]);
  if (!rows.length) throw new HttpError(404, 'Task not found');
  const task = format(rows[0], viewer);
  if (viewer && viewer.id === rows[0].customer_id) {
    const [offers] = await pool.query(
      `SELECT o.id, o.price_kobo, o.message, o.status, o.created_at, u.id AS tasker_id, u.full_name,
              tp.rating_total, tp.rating_count, tp.jobs_completed
         FROM offers o JOIN users u ON u.id = o.tasker_id JOIN tasker_profiles tp ON tp.user_id = u.id
        WHERE o.task_id = ? AND o.status <> 'withdrawn' ORDER BY o.price_kobo ASC`,
      [id],
    );
    task.offers = offers.map((o) => ({
      id: o.id,
      price: toNaira(o.price_kobo),
      message: o.message,
      status: o.status,
      tasker: {
        id: o.tasker_id,
        name: o.full_name,
        rating: o.rating_count ? Math.round((o.rating_total / o.rating_count) * 10) / 10 : null,
        ratingCount: o.rating_count,
        jobsCompleted: o.jobs_completed,
      },
    }));
  }
  return task;
}

async function listOpen({ category, city, viewer }) {
  const where = ["t.status = 'open'"];
  const params = [];
  if (category) { where.push('c.slug = ?'); params.push(category); }
  if (city) { where.push('t.city = ?'); params.push(city); }
  const [rows] = await pool.query(`${BASE_SELECT} WHERE ${where.join(' AND ')} ORDER BY t.is_urgent DESC, t.created_at DESC, t.id DESC LIMIT 100`, params);
  return rows.map((r) => format(r, viewer));
}

async function listForCustomer(customerId) {
  const [rows] = await pool.query(`${BASE_SELECT} WHERE t.customer_id = ? ORDER BY t.created_at DESC, t.id DESC`, [customerId]);
  return rows.map((r) => format(r, { id: customerId }));
}

async function listForTasker(taskerId) {
  const [rows] = await pool.query(`${BASE_SELECT} WHERE t.assigned_tasker_id = ? ORDER BY t.updated_at DESC, t.id DESC`, [taskerId]);
  return rows.map((r) => format(r, { id: taskerId }));
}

/** Customer accepts one offer: the task is assigned, other offers are declined and payment is held in escrow. */
async function acceptOffer(customerId, taskId, offerId) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const task = await getRaw(taskId, conn, true);
    if (task.customer_id !== customerId) throw new HttpError(403, 'This is not your task');
    if (task.status !== 'open') throw new HttpError(409, 'This task already has a tasker');
    const [offers] = await conn.query("SELECT * FROM offers WHERE id = ? AND task_id = ? AND status = 'pending'", [offerId, taskId]);
    if (!offers.length) throw new HttpError(404, 'Offer not found or no longer available');
    const offer = offers[0];
    const fee = Math.round((offer.price_kobo * platformFeePercent) / 100);
    await conn.query(
      `UPDATE tasks SET status = 'assigned', assigned_tasker_id = ?, agreed_price_kobo = ?, platform_fee_kobo = ?, tasker_payout_kobo = ?
        WHERE id = ?`,
      [offer.tasker_id, offer.price_kobo, fee, offer.price_kobo - fee, taskId],
    );
    await conn.query("UPDATE offers SET status = 'accepted' WHERE id = ?", [offerId]);
    await conn.query("UPDATE offers SET status = 'declined' WHERE task_id = ? AND id <> ? AND status = 'pending'", [taskId, offerId]);
    await conn.query("INSERT INTO payments (task_id, amount_kobo, status) VALUES (?, ?, 'held')", [taskId, offer.price_kobo]);
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
  return getById(taskId, { id: customerId });
}

async function markCompleted(taskerId, taskId) {
  const task = await getRaw(taskId);
  if (task.assigned_tasker_id !== taskerId) throw new HttpError(403, 'You are not assigned to this task');
  if (task.status !== 'assigned') throw new HttpError(409, `Cannot complete a task that is ${task.status}`);
  await pool.query("UPDATE tasks SET status = 'completed' WHERE id = ?", [taskId]);
  return getById(taskId, { id: taskerId });
}

/** Customer confirms the work: escrow is released to the tasker and the customer leaves a review. */
async function confirmAndReview(customerId, taskId, { rating, comment }) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const task = await getRaw(taskId, conn, true);
    if (task.customer_id !== customerId) throw new HttpError(403, 'This is not your task');
    if (task.status !== 'completed') throw new HttpError(409, 'The tasker has not marked this task as completed yet');
    await conn.query("UPDATE tasks SET status = 'confirmed' WHERE id = ?", [taskId]);
    await conn.query("UPDATE payments SET status = 'released' WHERE task_id = ?", [taskId]);
    await conn.query(
      'INSERT INTO reviews (task_id, customer_id, tasker_id, rating, comment) VALUES (?, ?, ?, ?, ?)',
      [taskId, customerId, task.assigned_tasker_id, rating, comment],
    );
    await conn.query(
      `UPDATE tasker_profiles SET rating_total = rating_total + ?, rating_count = rating_count + 1,
              jobs_completed = jobs_completed + 1 WHERE user_id = ?`,
      [rating, task.assigned_tasker_id],
    );
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
  return getById(taskId, { id: customerId });
}

/** Customer cancels: allowed while open or assigned (before the work is marked done). Held money is refunded. */
async function cancel(customerId, taskId) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const task = await getRaw(taskId, conn, true);
    if (task.customer_id !== customerId) throw new HttpError(403, 'This is not your task');
    if (!['open', 'assigned'].includes(task.status)) throw new HttpError(409, `Cannot cancel a task that is ${task.status}`);
    await conn.query("UPDATE tasks SET status = 'cancelled' WHERE id = ?", [taskId]);
    await conn.query("UPDATE offers SET status = 'declined' WHERE task_id = ? AND status = 'pending'", [taskId]);
    await conn.query("UPDATE payments SET status = 'refunded' WHERE task_id = ? AND status = 'held'", [taskId]);
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
  return getById(taskId, { id: customerId });
}

module.exports = {
  create, getById, listOpen, listForCustomer, listForTasker, acceptOffer, markCompleted, confirmAndReview, cancel,
};
