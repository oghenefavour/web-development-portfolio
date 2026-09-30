const path = require('path');
const express = require('express');
const helmet = require('helmet');
const pool = require('./config/db');
const productRoutes = require('./routes/products');
const cartRoutes = require('./routes/carts');
const orderRoutes = require('./routes/orders');
const { notFound, errorHandler } = require('./middleware/errorHandler');

const app = express();

app.use(helmet());
app.use(express.json({ limit: '100kb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));

app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', database: 'connected' });
  } catch (err) {
    res.status(503).json({ status: 'error', database: 'not connected', hint: 'Check the DB_* environment variables' });
  }
});

app.use('/api', productRoutes);
app.use('/api', cartRoutes);
app.use('/api', orderRoutes);

app.use('/api', notFound);
app.use(errorHandler);

module.exports = app;
