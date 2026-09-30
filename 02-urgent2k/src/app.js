const path = require('path');
const express = require('express');
const helmet = require('helmet');
const pool = require('./config/db');
const authRoutes = require('./routes/auth');
const taskRoutes = require('./routes/tasks');
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

app.use('/api', authRoutes);
app.use('/api', taskRoutes);
app.use('/api', notFound);
app.use(errorHandler);

module.exports = app;
