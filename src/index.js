const express = require('express');
const cors = require('cors');
const ExcelJS = require('exceljs');
const dotenv = require('dotenv');
const jwt = require('jsonwebtoken');
const db = require('./db'); 
const { verifyToken, authorizeRole, Roles } = require('./middleware/auth');
const { getDistrictFromID } = require('./idGenerator');

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
const adminMiddleware = [verifyToken, authorizeRole([Roles.DISTRICT_ADMIN, Roles.ADMIN, Roles.SUPERADMIN])];
const viewerMiddleware = [verifyToken, authorizeRole([Roles.DISTRICT_ADMIN, Roles.VIEWER, Roles.ADMIN, Roles.SUPERADMIN, Roles.DISTRICT_VIEWER])];

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;

  const sql = 'SELECT username, password, role, district FROM users WHERE username = ?';
  
  db.query(sql, [username], async (err, results) => {
    if (err) {
      console.error('Error fetching user:', err);
      return res.status(500).json({ error: 'Database error' });
    }
    
    if (results.length === 0) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    const user = results[0];
    
    // If no password is set, require setup
    if (!user.password) {
      return res.json({ requiresPasswordSetup: true });
    }
    
    // Check if provided password matches
    if (user.password !== password) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    const token = jwt.sign(
      { username: user.username, role: user.role, district: user.district },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

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

app.post('/api/check-user', async (req, res) => {
  const { username } = req.body;

  const sql = 'SELECT username, password FROM users WHERE username = ?';
  
  db.query(sql, [username], (err, results) => {
    if (err) {
      console.error('Error checking user:', err);
      return res.status(500).json({ error: 'Database error' });
    }
    
    if (results.length === 0) {
      return res.status(401).json({ error: 'Invalid username' });
    }

    const user = results[0];
    
    // Check if password field is null or empty
    if (!user.password) {
      return res.json({ requiresPasswordSetup: true });
    }
    
    res.json({ requiresPasswordSetup: false });
  });
});

app.get('/', (req, res) => {
  res.send('Employee Backend is running');
});

app.post('/api/employees', adminMiddleware, async (req, res) => {
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

  const connection = await db.promise().getConnection();
  await connection.beginTransaction();

  try {
    let finalEmployeeID = employee_id;

    if (!finalEmployeeID) {
      // Get the district code (DD)
      const districtIndex = districts.indexOf(place_of_posting) + 1;
      const DD = districtIndex.toString().padStart(2, '0');
      
      // Set role digit (R)
      const R = '1'; // Default to district_admin for new employees
      
      // Get current max sequence number for this district and role
      const [result] = await connection.query(
        'SELECT MAX(CAST(RIGHT(employee_id, 2) AS UNSIGNED)) as max_seq ' +
        'FROM employees WHERE LEFT(employee_id, 2) = ? AND SUBSTRING(employee_id, 3, 1) = ?',
        [DD, R]
      );
      
      // Calculate next sequence number
      const currentSeq = result[0].max_seq || 0;
      const XX = (currentSeq + 1).toString().padStart(2, '0');
      
      // Construct the ID
      finalEmployeeID = `${DD}${R}${XX}`;
    }

    // Validate the district from ID
    const district = getDistrictFromID(finalEmployeeID);
    const finalDistrict = district || place_of_posting;

    // Determine role from ID structure
    const roleDigit = finalEmployeeID.charAt(2);
    const districtCode = finalEmployeeID.slice(0, 2);
    
    let role;
    if (districtCode === "00") {
      role = roleDigit === "1" ? "superadmin" : 
             roleDigit === "2" ? "admin" : 
             roleDigit === "0" ? "viewer" : null;
    } else {
      role = roleDigit === "1" ? "district_admin" : 
             roleDigit === "0" ? "district_viewer" : null;
    }

    if (!role) {
      throw new Error(`Invalid role digit in employee ID: ${roleDigit}`);
    }

    // Insert employee record
    const employeeSQL = `
      INSERT INTO employees (
        employee_id, name, designation, gender, place_of_posting,
        date_of_birth, date_of_joining, cause_of_vacancy, caste,
        posted_against_reservation, pwd, ex_servicemen,
        assembly_constituency, creation_no, retention_no,
        man_in_position, name_of_treasury
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const employeeValues = [
      finalEmployeeID, name, designation, gender, finalDistrict,
      date_of_birth, date_of_joining, cause_of_vacancy || null,
      caste || null, posted_against_reservation || null,
      pwd ? 1 : 0, ex_servicemen ? 1 : 0,
      assembly_constituency || null, creation_no || null,
      retention_no || null, man_in_position || null,
      name_of_treasury || null
    ];

    await connection.query(employeeSQL, employeeValues);

    // Insert user record for authentication
    const userSQL = `
      INSERT INTO users (username, role, district) 
      VALUES (?, ?, ?)
    `;
    
    await connection.query(userSQL, [finalEmployeeID, role, finalDistrict]);

    await connection.commit();

    res.status(201).json({ 
      id: finalEmployeeID,
      employee_id: finalEmployeeID,
      name,
      role,
      district: finalDistrict
    });

  } catch (err) {
    await connection.rollback();
    console.error('Error in employee creation:', err);
    res.status(500).json({ 
      error: 'Employee creation failed',
      details: err.message 
    });
  } finally {
    connection.release();
  }
});

app.get('/api/employees', viewerMiddleware, (req, res) => {
  const { district, role } = req.user; 
  let sql = 'SELECT * FROM employees';
  const params = [];

  if (role === Roles.DISTRICT_ADMIN || role === Roles.DISTRICT_VIEWER) {
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

app.get('/api/reports/excel', viewerMiddleware, async (req, res) => {
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

app.get('/api/roster-report', viewerMiddleware, async (req, res) => {
  try {
    const rosterPoints = require('./rosterPoints.json'); // Load the roster points JSON
    const sql = 'SELECT * FROM employees'; // Fetch all employees
    db.query(sql, (err, results) => {
      if (err) {
        console.error('Error fetching employees:', err);
        return res.status(500).json({ error: 'Database retrieval error' });
      }

      const normalizeEmployee = (employee) => {
        let { caste, pwd } = employee;
        caste = caste?.toUpperCase();
        pwd = pwd === 1;
        return { ...employee, caste, pwd };
      };

      const employees = results.map(normalizeEmployee);
      const assignedData = [];
      const usedEmployeeIds = new Set();

      rosterPoints.forEach((rp) => {
        const { caste, pwd } = rp.filters;
        const filtered = employees.filter((emp) => {
          const notUsed = !usedEmployeeIds.has(emp.employee_id);
          const matchesCaste = caste ? emp.caste === caste : true;
          const matchesPwd = pwd === undefined ? true : emp.pwd === pwd;
          return notUsed && matchesCaste && matchesPwd;
        });

        const assignedEmployee = filtered.length > 0 ? filtered[0] : null;
        if (assignedEmployee) {
          usedEmployeeIds.add(assignedEmployee.employee_id);
        }
        assignedData.push({
          ...rp,
          employee: assignedEmployee,
          district: assignedEmployee?.place_of_posting || 'N/A',
          remarks: '',
        });
      });

      res.json(assignedData.sort((a, b) => a.rosterPointNo - b.rosterPointNo));
    });
  } catch (error) {
    console.error('Error in /api/roster-report:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/roster/excel', viewerMiddleware, async (req, res) => {
  try {
    const sql = `
      SELECT 
        employee_id, name, designation, place_of_posting, 
        date_of_joining, caste, pwd
      FROM employees
    `;

    db.query(sql, async (err, results) => {
      if (err) {
        console.error('Error fetching roster data:', err);
        return res.status(500).json({ error: 'Database retrieval error' });
      }

      const rosterPoints = [
        { rosterPointNo: 1, rosterPoint: 'UR (PwD)', filters: { caste: 'UR', pwd: true } },
        { rosterPointNo: 2, rosterPoint: 'OBC/MOBC', filters: { caste: 'OBC/MOBC' } },
      ];

      const normalizeEmployee = (employee) => {
        let { caste, pwd } = employee;
        if (caste) {
          caste = caste.toUpperCase().includes('OBC') ? 'OBC/MOBC' : 'UR';
        }
        pwd = pwd === 1;
        return { ...employee, caste, pwd };
      };

      const employees = results.map(normalizeEmployee);
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Roster Report');

      worksheet.columns = [
        { header: 'Roster Point No.', key: 'rosterPointNo', width: 15 },
        { header: 'Roster Point', key: 'rosterPoint', width: 20 },
        { header: 'Name', key: 'name', width: 25 },
        { header: 'Designation', key: 'designation', width: 25 },
        { header: 'Date of Joining', key: 'dateOfJoining', width: 15 },
      ];

      rosterPoints.forEach((rp) => {
        const filtered = employees.find((emp) => emp.caste === rp.filters.caste && emp.pwd === rp.filters.pwd);
        worksheet.addRow({
          rosterPointNo: rp.rosterPointNo,
          rosterPoint: rp.rosterPoint,
          name: filtered ? filtered.name : 'N/A',
          designation: filtered ? filtered.designation : 'N/A',
          dateOfJoining: filtered ? filtered.date_of_joining : 'N/A',
        });
      });

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename=roster_report.xlsx');
      await workbook.xlsx.write(res);
      res.end();
    });
  } catch (error) {
    console.error('Error generating Excel report:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});
