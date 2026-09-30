const pool = require('../config/db');
const HttpError = require('../utils/httpError');
const { toNaira } = require('../utils/money');

async function create(taskerId, taskId, { priceKobo, message }) {
  const [tasks] = await pool.query('SELECT id, status, customer_id, category_id FROM tasks WHERE id = ?', [taskId]);
  if (!tasks.length) throw new HttpError(404, 'Task not found');
  const task = tasks[0];
  if (task.status !== 'open') throw new HttpError(409, 'This task is no longer taking offers');
  const [skills] = await pool.query('SELECT 1 FROM tasker_categories WHERE user_id = ? AND category_id = ?', [taskerId, task.category_id]);
  if (!skills.length) throw new HttpError(403, 'You can only make offers on tasks in your skill categories');
  const [existing] = await pool.query('SELECT id, status FROM offers WHERE task_id = ? AND tasker_id = ?', [taskId, taskerId]);
  if (existing.length && existing[0].status !== 'withdrawn') throw new HttpError(409, 'You have already made an offer on this task');
  if (existing.length) {
    await pool.query("UPDATE offers SET price_kobo = ?, message = ?, status = 'pending' WHERE id = ?", [priceKobo, message, existing[0].id]);
    return findById(existing[0].id);
  }
  const [res] = await pool.query('INSERT INTO offers (task_id, tasker_id, price_kobo, message) VALUES (?, ?, ?, ?)', [taskId, taskerId, priceKobo, message]);
  return findById(res.insertId);
}

async function findById(id) {
  const [rows] = await pool.query(
    `SELECT o.*, t.title, t.status AS task_status, t.city, t.area FROM offers o JOIN tasks t ON t.id = o.task_id WHERE o.id = ?`,
    [id],
  );
  return rows.length ? format(rows[0]) : null;
}

function format(o) {
  return {
    id: o.id,
    price: toNaira(o.price_kobo),
    message: o.message,
    status: o.status,
    task: { id: o.task_id, title: o.title, status: o.task_status, city: o.city, area: o.area },
    createdAt: o.created_at,
  };
}

async function listForTasker(taskerId) {
  const [rows] = await pool.query(
    `SELECT o.*, t.title, t.status AS task_status, t.city, t.area FROM offers o JOIN tasks t ON t.id = o.task_id
      WHERE o.tasker_id = ? ORDER BY o.created_at DESC, o.id DESC`,
    [taskerId],
  );
  return rows.map(format);
}

async function withdraw(taskerId, offerId) {
  const [rows] = await pool.query('SELECT tasker_id, status FROM offers WHERE id = ?', [offerId]);
  if (!rows.length || rows[0].tasker_id !== taskerId) throw new HttpError(404, 'Offer not found');
  if (rows[0].status !== 'pending') throw new HttpError(409, `Cannot withdraw an offer that is ${rows[0].status}`);
  await pool.query("UPDATE offers SET status = 'withdrawn' WHERE id = ?", [offerId]);
  return findById(offerId);
}

async function earnings(taskerId) {
  const [[row]] = await pool.query(
    `SELECT
        COALESCE(SUM(CASE WHEN p.status = 'released' THEN t.tasker_payout_kobo END), 0) AS released,
        COALESCE(SUM(CASE WHEN p.status = 'held' THEN t.tasker_payout_kobo END), 0) AS pending,
        COALESCE(SUM(CASE WHEN p.status = 'released' THEN t.platform_fee_kobo END), 0) AS fees,
        SUM(p.status = 'released') AS paid_jobs
       FROM tasks t JOIN payments p ON p.task_id = t.id
      WHERE t.assigned_tasker_id = ?`,
    [taskerId],
  );
  return {
    paidOut: toNaira(Number(row.released)),
    inEscrow: toNaira(Number(row.pending)),
    platformFeesPaid: toNaira(Number(row.fees)),
    paidJobs: Number(row.paid_jobs || 0),
  };
}

module.exports = { create, listForTasker, withdraw, earnings };
