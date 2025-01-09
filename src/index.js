const express = require('express');
const cors = require('cors');
const ExcelJS = require('exceljs');
const dotenv = require('dotenv');
const jwt = require('jsonwebtoken');
const db = require('./db'); 
const { verifyToken, authorizeRole, Roles } = require('./middleware/auth');

dotenv.config();

const app = express();

app.use(cors({
  origin: 'http://localhost:5173', 
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json()); 

const PORT = process.env.PORT || 3000;

const superadminMiddleware = [verifyToken, authorizeRole([Roles.SUPERADMIN])];
const adminMiddleware = [verifyToken, authorizeRole([Roles.ADMIN, Roles.SUPERADMIN])];
const viewerMiddleware = [verifyToken, authorizeRole([Roles.VIEWER, Roles.ADMIN, Roles.SUPERADMIN])];

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

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

app.post('/api/employees', adminMiddleware, (req, res) => {
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
    assembly_constituency,
    creation_no,
    retention_no,
    man_in_position,
    name_of_treasury
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
      ex_servicemen,
      assembly_constituency,
      creation_no,
      retention_no,
      man_in_position,
      name_of_treasury
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
    assembly_constituency || null,
    creation_no,
    retention_no,
    man_in_position || null,
    name_of_treasury || null
  ];

  db.query(sql, values, (err, result) => {
    if (err) {
      console.error('Error inserting employee:', err);
      return res.status(500).json({ error: 'Database insertion error' });
    }
    res.status(201).json({ id: result.insertId, employee_id, name });
  });
});


app.get('/api/employees', viewerMiddleware, (req, res) => {
  const { district } = req.query;
  let sql = 'SELECT * FROM employees';
  const params = [];

  if (district) {
    sql += ' WHERE place_of_posting = ?';
    params.push(district);
  }

  db.query(sql, params, (err, results) => {
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

app.put('/api/employees/:employee_id', viewerMiddleware, (req, res) => {
  const { employee_id } = req.params;
  const updatedData = req.body;
  const requestedBy = req.user.username;

  const sql = `INSERT INTO pending_changes (employee_id, updated_data, requested_by) VALUES (?, ?, ?)`;
  db.query(sql, [employee_id, JSON.stringify(updatedData), requestedBy], (err, result) => {
      if (err) {
          console.error('Error storing pending change:', err);
          return res.status(500).json({ error: 'Database error' });
      }
      res.json({ message: 'Update request submitted for approval' });
  });
});

app.get('/api/pending-changes', adminMiddleware, (req, res) => {
  const sql = `SELECT * FROM pending_changes WHERE status = 'pending'`;
  db.query(sql, (err, results) => {
      if (err) return res.status(500).json({ error: 'Database retrieval error' });
      res.json(results);
  });
});

app.put('/api/pending-changes/:id/approve', verifyToken, superadminMiddleware, async (req, res) => {
  const { id } = req.params;
  try {
      const [pendingChange] = await db.promise().query(
          'SELECT * FROM pending_changes WHERE id = ? AND status = "pending"',
          [id]
      );

      if (!pendingChange || pendingChange.length === 0) {
          return res.status(404).json({ error: 'Pending change not found or already processed.' });
      }

      const changeData = pendingChange[0];
      const { employee_id, updated_data } = changeData;

      let parsedData;
      if (typeof updated_data === 'string') {
          try {
              parsedData = JSON.parse(updated_data);
          } catch (error) {
              console.error('Invalid JSON in updated_data:', updated_data);
              return res.status(400).json({ error: 'Invalid JSON in updated_data field.' });
          }
      } else if (typeof updated_data === 'object') {
          parsedData = updated_data;
      } else {
          console.error('Unexpected data format in updated_data:', updated_data);
          return res.status(400).json({ error: 'Unexpected data format in updated_data field.' });
      }

      const validColumns = [
          'pwd',
          'name',
          'caste',
          'gender',
          'designation',
          'employee_id',
          'date_of_birth',
          'ex_servicemen',
          'date_of_joining',
          'cause_of_vacancy',
          'place_of_posting',
          'posted_against_reservation'
      ];

      const filteredData = Object.keys(parsedData)
          .filter(key => validColumns.includes(key))
          .reduce((obj, key) => {
              obj[key] = parsedData[key];
              return obj;
          }, {});

      if (Object.keys(filteredData).length === 0) {
          return res.status(400).json({ error: 'No valid fields to update.' });
      }

      const fields = Object.keys(filteredData).map(field => `${field} = ?`).join(', ');
      const values = [...Object.values(filteredData), employee_id];

      await db.promise().query(
          'UPDATE pending_changes SET status = "approved" WHERE id = ?',
          [id]
      );

      await db.promise().query(
          `UPDATE employees SET ${fields} WHERE employee_id = ?`,
          values
      );

      res.json({ message: 'Change approved and employee data updated successfully.' });
  } catch (error) {
      console.error('Error in authorising pending change:', error);
      res.status(500).json({ error: 'Internal server error.' });
  }
});


app.put('/api/pending-changes/:id/reject', superadminMiddleware, (req, res) => {
  const { id } = req.params;
  const sql = `UPDATE pending_changes SET status = 'rejected' WHERE id = ?`;
  db.query(sql, [id], (err) => {
      if (err) return res.status(500).json({ error: 'Error updating request status' });
      res.json({ message: 'Change request rejected' });
  });
});


app.delete('/api/employees/:employee_id', superadminMiddleware, (req, res) => {
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

app.get('/api/districts', verifyToken, (req, res) => {
  const sql = 'SELECT DISTINCT place_of_posting AS district FROM employees';
  db.query(sql, (err, results) => {
    if (err) return res.status(500).json({ error: 'Database retrieval error' });
    res.json(results.map((row) => row.district));
  });
});

app.get('/api/reports', viewerMiddleware, (req, res) => {
  const sql = `
  SELECT 
    employee_id AS id,
    place_of_posting AS district,
    assembly_constituency AS officeName,
    name AS incumbentName,
    designation AS postName,
    cause_of_vacancy AS causeOfVacancy,
    date_of_retirement AS dateOfVacancy, -- Assuming date_of_retirement represents this field
    creation_no AS creationNo,
    retention_no AS retentionNo,
    man_in_position AS manInPosition,
    name_of_treasury AS treasuryName
  FROM employees
  ORDER BY district ASC, officeName ASC
`;

  db.query(sql, (err, results) => {
    if (err) {
      console.error('Error fetching report data:', err);
      return res.status(500).json({ error: 'Database retrieval error' });
    }

    res.json(results);
  });
});

app.get('/api/reports/excel-siu', viewerMiddleware, async (req, res) => {
  try {
    const sql = `
      SELECT 
        employee_id AS id,
        place_of_posting AS district,
        assembly_constituency AS officeName,
        name AS incumbentName,
        designation AS postName,
        cause_of_vacancy AS causeOfVacancy,
        date_of_retirement AS dateOfVacancy,
        creation_no AS creationNo,
        retention_no AS retentionNo,
        man_in_position AS manInPosition,
        name_of_treasury AS treasuryName
      FROM employees
      ORDER BY district ASC, officeName ASC
    `;

    db.query(sql, async (err, results) => {
      if (err) {
        console.error('Error fetching report data for Excel:', err);
        return res.status(500).json({ error: 'Database retrieval error' });
      }

      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Report');

      worksheet.columns = [
        { header: 'S.No', key: 'sno', width: 10 },
        { header: 'District', key: 'district', width: 20 },
        { header: 'Office Name', key: 'officeName', width: 25 },
        { header: 'Incumbent Name', key: 'incumbentName', width: 25 },
        { header: 'Post Name', key: 'postName', width: 25 },
        { header: 'Cause of Vacancy', key: 'causeOfVacancy', width: 20 },
        { header: 'Date of Vacancy', key: 'dateOfVacancy', width: 15 },
        { header: 'Creation No.', key: 'creationNo', width: 15 },
        { header: 'Retention No.', key: 'retentionNo', width: 15 },
        { header: 'Man in Position', key: 'manInPosition', width: 15 },
        { header: 'Treasury Name', key: 'treasuryName', width: 20 },
      ];

      results.forEach((row, index) => {
        worksheet.addRow({
          sno: index + 1,
          ...row,
        });
      });

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename=report.xlsx');

      await workbook.xlsx.write(res);
      res.end();
    });
  } catch (error) {
    console.error('Error generating Excel report:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});