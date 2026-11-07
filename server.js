require('dotenv').config();
const express = require('express');
const path = require('path');
const mysql = require('mysql2/promise');

const db = mysql.createPool({
    host: 'localhost',
    user: 'root',
    password: 'root',
    database: 'laundry_service_db'
});
db.query('SELECT 1')
  .then(() => console.log('MySQL connected successfully'))
  .catch(err => console.error('MySQL error:', err.message));

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Wraps async handlers so errors are returned as JSON instead of crashing the server
const wrap = fn => (req, res) =>
  fn(req, res).catch(err => {
    console.error(err);
    const msg = err.code === 'ER_ROW_IS_REFERENCED_2'
      ? 'This record is used by other data and cannot be deleted.'
      : (err.sqlMessage || err.message);
    res.status(500).json({ error: msg });
  });

// ---------- SERVICES ----------
app.get('/api/services', wrap(async (req, res) => {
  const [rows] = await db.query('SELECT * FROM services ORDER BY service_id');
  res.json(rows);
}));
app.post('/api/services', wrap(async (req, res) => {
  const { service_name, price_per_kg, description } = req.body;
  if (!service_name || !(Number(price_per_kg) > 0))
    return res.status(400).json({ error: 'Service name and a price above 0 are required.' });
  const [r] = await db.query(
    'INSERT INTO services (service_name, price_per_kg, description) VALUES (?,?,?)',
    [service_name, price_per_kg, description || null]);
  res.status(201).json({ service_id: r.insertId });
}));
app.put('/api/services/:id', wrap(async (req, res) => {
  const { service_name, price_per_kg, description } = req.body;
  await db.query(
    'UPDATE services SET service_name=?, price_per_kg=?, description=? WHERE service_id=?',
    [service_name, price_per_kg, description || null, req.params.id]);
  res.json({ ok: true });
}));
app.delete('/api/services/:id', wrap(async (req, res) => {
  await db.query('DELETE FROM services WHERE service_id=?', [req.params.id]);
  res.json({ ok: true });
}));

// ---------- CUSTOMERS ----------
app.get('/api/customers', wrap(async (req, res) => {
  const [rows] = await db.query('SELECT * FROM customers ORDER BY name');
  res.json(rows);
}));
app.post('/api/customers', wrap(async (req, res) => {
  const { name, phone, email, address } = req.body;
  if (!name || !phone) return res.status(400).json({ error: 'Name and phone are required.' });
  const [r] = await db.query(
    'INSERT INTO customers (name, phone, email, address) VALUES (?,?,?,?)',
    [name, phone, email || null, address || null]);
  res.status(201).json({ customer_id: r.insertId });
}));
app.put('/api/customers/:id', wrap(async (req, res) => {
  const { name, phone, email, address } = req.body;
  if (!name || !phone) return res.status(400).json({ error: 'Name and phone are required.' });
  await db.query(
    'UPDATE customers SET name=?, phone=?, email=?, address=? WHERE customer_id=?',
    [name, phone, email || null, address || null, req.params.id]);
  res.json({ ok: true });
}));
app.delete('/api/customers/:id', wrap(async (req, res) => {
  await db.query('DELETE FROM customers WHERE customer_id=?', [req.params.id]);
  res.json({ ok: true });
}));

// ---------- ORDERS ----------
app.get('/api/orders', wrap(async (req, res) => {
  const [rows] = await db.query(
    `SELECT o.*, c.name AS customer_name, s.service_name
     FROM orders o
     JOIN customers c ON o.customer_id = c.customer_id
     JOIN services s ON o.service_id = s.service_id
     ORDER BY o.order_id DESC`);
  res.json(rows);
}));
app.post('/api/orders', wrap(async (req, res) => {
  const { customer_id, service_id, clothes_weight } = req.body;
  const weight = Number(clothes_weight);
  if (!customer_id || !service_id || !(weight > 0))
    return res.status(400).json({ error: 'Customer, service and a weight above 0 are required.' });
  const [[service]] = await db.query('SELECT price_per_kg FROM services WHERE service_id=?', [service_id]);
  if (!service) return res.status(400).json({ error: 'Service not found.' });

  // The total is calculated on the server so it can't be tampered with
  const total = +(weight * service.price_per_kg).toFixed(2);
  const [r] = await db.query(
    `INSERT INTO orders (customer_id, service_id, clothes_weight, order_date, total_amount, status)
     VALUES (?,?,?,CURDATE(),?, 'Pending')`, [customer_id, service_id, weight, total]);
  await db.query(
    `INSERT INTO payments (order_id, amount, payment_date, status) VALUES (?,?,CURDATE(),'Unpaid')`,
    [r.insertId, total]);
  res.status(201).json({ order_id: r.insertId, total_amount: total });
}));
app.patch('/api/orders/:id/status', wrap(async (req, res) => {
  await db.query('UPDATE orders SET status=? WHERE order_id=?', [req.body.status, req.params.id]);
  res.json({ ok: true });
}));
app.delete('/api/orders/:id', wrap(async (req, res) => {
  await db.query('DELETE FROM orders WHERE order_id=?', [req.params.id]);
  res.json({ ok: true });
}));

// ---------- PAYMENTS ----------
app.get('/api/payments', wrap(async (req, res) => {
  const [rows] = await db.query(
    `SELECT p.*, c.name AS customer_name
     FROM payments p
     JOIN orders o ON p.order_id = o.order_id
     JOIN customers c ON o.customer_id = c.customer_id
     ORDER BY p.payment_id DESC`);
  res.json(rows);
}));
app.put('/api/payments/:id', wrap(async (req, res) => {
  const { amount, payment_method, status } = req.body;
  await db.query(
    'UPDATE payments SET amount=?, payment_method=?, status=?, payment_date=CURDATE() WHERE payment_id=?',
    [amount, payment_method || null, status, req.params.id]);
  res.json({ ok: true });
}));

// ---------- DASHBOARD ----------
app.get('/api/stats', wrap(async (req, res) => {
  const [[c]] = await db.query('SELECT COUNT(*) AS n FROM customers');
  const [[o]] = await db.query('SELECT COUNT(*) AS n FROM orders');
  const [[p]] = await db.query("SELECT COUNT(*) AS n FROM orders WHERE status='Pending'");
  const [[r]] = await db.query("SELECT COALESCE(SUM(amount),0) AS n FROM payments WHERE status IN ('Paid','Partial')");
  res.json({ customers: c.n, orders: o.n, pending: p.n, revenue: r.n });
}));

db.query('SELECT 1')
  .then(() => console.log('MySQL connected'))
  .catch(err => console.error('MySQL connection failed:', err.message));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));
