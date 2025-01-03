// src/index.js
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const db = require('./db'); 
const { verifyToken, authorizeRole } = require('./middleware/auth');

dotenv.config();

const app = express();

app.use(cors({
  origin: 'http://localhost:5173', 
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json()); 

const PORT = process.env.PORT || 5000;

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  console.log('from backend: username:', username , 'password:', password);

  const sql = 'SELECT * FROM users WHERE username = ?';
  console.log('sql query:', sql);
  db.query(sql, [username], async (err, results) => {
    if (err) {
      console.error('Error fetching user:', err);
      return res.status(500).json({ error: 'Database error' });
    }
    if (results.length === 0) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    const user = results[0];

    const token = jwt.sign(
      { username: user.username, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );
    console.log("Generated Token:", token)
    res.json({ token });
  });
});

app.post('/api/reset-password', async (req, res) => {
  const { username, newPassword } = req.body;

  if (!username || !newPassword) {
    return res.status(400).json({ error: 'Username and new password are required' });
  }

  const sql = 'UPDATE users SET password = ? WHERE username = ?';
  db.query(sql, [newPassword, username], (err, result) => {
    if (err) {
      console.error('Error updating password:', err);
      return res.status(500).json({ error: 'Database update error' });
    }

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ message: 'Password updated successfully' });
  });
});

app.get('/', (req, res) => {
  res.send('Employee Backend is running');
});

app.post('/api/employees', verifyToken, authorizeRole(['admin', 'superadmin']), (req, res) => {
  const {
    employee_id,
    name,
    designation,
    gender,
    place_of_posting,
    date_of_birth,
    date_of_joining,
    cause_of_vacancy,
    caste,
    posted_against_reservation,
    pwd,
    ex_servicemen,
  } = req.body;

  const sql = `
    INSERT INTO employees (
      employee_id,
      name,
      designation,
      gender,
      place_of_posting,
      date_of_birth,
      date_of_joining,
      cause_of_vacancy,
      caste,
      posted_against_reservation,
      pwd,
      ex_servicemen
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  const values = [
    employee_id,
    name,
    designation,
    gender,
    place_of_posting,
    date_of_birth,
    date_of_joining,
    cause_of_vacancy || null,
    caste || null,
    posted_against_reservation || null,
    pwd ? 1 : 0, 
    ex_servicemen ? 1 : 0,
  ];

  db.query(sql, values, (err, result) => {
    if (err) {
      console.error('Error inserting employee:', err);
      return res.status(500).json({ error: 'Database insertion error' });
    }
    res.status(201).json({ id: result.insertId, employee_id, name });
  });
});


app.get('/api/employees', verifyToken, authorizeRole(['viewer', 'admin', 'superadmin']), (req, res) => {
  const sql = 'SELECT * FROM employees';
  db.query(sql, (err, results) => {
    if (err) return res.status(500).json({ error: 'Database retrieval error' });
    res.json(results);
  });
});

app.get('/api/employees/:employee_id', (req, res) => {
  const { employee_id } = req.params;
  const sql = 'SELECT * FROM employees WHERE employee_id = ?';
  db.query(sql, [employee_id], (err, results) => {
    if (err) {
      console.error('Error fetching employee:', err);
      return res.status(500).json({ error: 'Database retrieval error' });
    }
    if (results.length === 0) {
      return res.status(404).json({ error: 'Employee not found' });
    }
    res.json(results[0]);
  });
});

app.put('/api/employees/:employee_id', verifyToken, authorizeRole(['viewer','admin', 'superadmin']), (req, res) => {
  const { employee_id } = req.params;
  const {
    name,
    designation,
    gender,
    place_of_posting,
    date_of_birth,
    date_of_joining,
    cause_of_vacancy,
    caste,
    posted_against_reservation,
    pwd,
    ex_servicemen,
  } = req.body;

  const sql = `
    UPDATE employees SET
      name = ?,
      designation = ?,
      gender = ?,
      place_of_posting = ?,
      date_of_birth = ?,
      date_of_joining = ?,
      cause_of_vacancy = ?,
      caste = ?,
      posted_against_reservation = ?,
      pwd = ?,
      ex_servicemen = ?
    WHERE employee_id = ?
  `;

  const values = [
    name,
    designation,
    gender,
    place_of_posting,
    date_of_birth,
    date_of_joining,
    cause_of_vacancy || null,
    caste || null,
    posted_against_reservation || null,
    pwd ? 1 : 0,
    ex_servicemen ? 1 : 0,
    employee_id,
  ];

  db.query(sql, values, (err, result) => {
    if (err) {
      console.error('Error updating employee:', err);
      return res.status(500).json({ error: 'Database update error' });
    }
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Employee not found' });
    }
    res.json({ employee_id, name });
  });
});

app.delete('/api/employees/:employee_id', verifyToken, authorizeRole(['superadmin']), (req, res) => {
  const { employee_id } = req.params;
  const sql = 'DELETE FROM employees WHERE employee_id = ?';
  db.query(sql, [employee_id], (err, result) => {
    if (err) {
      console.error('Error deleting employee:', err);
      return res.status(500).json({ error: 'Database deletion error' });
    }
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Employee not found' });
    }
    res.json({ message: 'Employee deleted successfully' });
  });
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
