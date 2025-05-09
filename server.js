const express = require('express');
const mysql = require('mysql2');
const session = require('express-session');
const bodyParser = require('body-parser');
const path = require('path');

const app = express();
const port = 3000;

// MySQL connection
const db = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: 'm2806',
  database: 'attendance-system'
});

db.connect(err => {
  if (err) throw err;
  console.log('Connected to MySQL database!');
});

// Middlewares
app.use(bodyParser.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  secret: 'secret-key',
  resave: false,
  saveUninitialized: true
}));

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.post('/login', (req, res) => {
  const { username, password } = req.body;
  const query = 'SELECT * FROM admin WHERE username = ? AND password = ?';

  db.query(query, [username, password], (err, results) => {
    if (err) throw err;
    if (results.length > 0) {
      req.session.loggedin = true;
      req.session.username = username;
      res.redirect('/dashboard');
    } else {
      res.send('Incorrect username or password. <a href=\"/\">Try again</a>.');
    }
  });
});

app.get('/dashboard', (req, res) => {
  if (req.session.loggedin) {
    res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
  } else {
    res.send('Please login to view this page! <a href=\"/\">Login</a>');
  }
});


// Route to handle attendance marking
app.post('/mark_attendance', (req, res) => {
  const updates = [];

  db.query('SELECT s_id FROM student', (err, students) => {
    if (err) return res.status(500).send('Error fetching students');

    students.forEach(student => {
      const isPresent = req.body[`present_${student.s_id}`] ? 1 : 0;

      updates.push(new Promise((resolve, reject) => {
        // First: Update attendance
        const attendanceUpdateQuery = `
          UPDATE attendance
          SET 
            total_days = total_days + 1,
            present_days = present_days + ?
          WHERE s_id = ?
        `;
        db.query(attendanceUpdateQuery, [isPresent, student.s_id], (err, result) => {
          if (err) return reject(err);

          // If student is absent, increase their leave count by 1
          if (!isPresent) {
            const leaveUpdateQuery = `
              UPDATE leaves
              SET days = days + 1
              WHERE s_id = ?
            `;
            db.query(leaveUpdateQuery, [student.s_id], (err, result) => {
              if (err) return reject(err);
              resolve();
            });
          } else {
            resolve(); // No leave update needed
          }
        });
      }));
    });

    // Wait for all updates to complete
    Promise.all(updates)
      .then(() => res.send('Attendance and leaves updated successfully!'))
      .catch(err => {
        console.error(err);
        res.status(500).send('Error updating attendance or leave days.');
      });
  });
});
  

// Route to view attendance
app.get('/view_attendance', (req, res) => {
  const { roll_no } = req.query;
  const query = `
    SELECT s.s_name, a.total_days, a.present_days
    FROM student s
    JOIN attendance a ON s.s_id = a.s_id
    WHERE s.s_id = ?
  `;
  db.query(query, [roll_no], (err, results) => {
    if (err) return res.status(500).send('Query failed.');
    if (results.length === 0) return res.send('No record found.');
    res.json(results[0]);
  });
});

  
// Route to send notification to one student
// Route to send notification to one student
app.post('/send_notification', (req, res) => {
  console.log("Request Body:", req.body);

  const { s_id, message } = req.body;

  if (!s_id || !message) {
    return res.status(400).send("Missing student ID or message.");
  }

  // Step 1: Get student's attendance
  const attendanceQuery = `
    SELECT total_days, present_days 
    FROM attendance 
    WHERE s_id = ?
  `;

  db.query(attendanceQuery, [s_id], (err, attendanceResult) => {
    if (err) {
      console.error("Database error while fetching attendance:", err);
      return res.status(500).send("Unable to send notification (DB error on attendance).");
    }

    if (!attendanceResult || attendanceResult.length === 0) {
      return res.status(404).send("Student attendance record not found.");
    }

    const { total_days, present_days } = attendanceResult[0];
    const attendancePercent = (present_days / total_days) * 100;

    console.log(`Attendance % for student ${s_id}: ${attendancePercent.toFixed(2)}%`);

    // Step 2: Check if attendance is above 80%
    if (attendancePercent > 80) {
      return res.status(400).send("Cannot send notification: Student's attendance is above 80%.");
    }

    // Step 3: If attendance is low, send notification
    const getPidQuery = "SELECT p_id FROM student WHERE s_id = ?";

    db.query(getPidQuery, [s_id], (err2, result) => {
      if (err2) {
        console.error("Database error while fetching parent ID:", err2);
        return res.status(500).send("Unable to send notification (DB error on parent ID).");
      }

      if (!result || result.length === 0) {
        console.error("No student found with that s_id:", s_id);
        return res.status(404).send("Unable to send notification (Student not found).");
      }

      const p_id = result[0].p_id;

      const insertQuery = "INSERT INTO notification (s_id, msg, p_id) VALUES (?, ?, ?)";

      db.query(insertQuery, [s_id, message, p_id], (err3, result2) => {
        if (err3) {
          console.error("Failed to insert notification:", err3);
          return res.status(500).send("Notification failed to save.");
        }

        res.send("Notification sent successfully!");
      });
    });
  });
});




app.post('/message', (req, res) => {
  const { roll_no } = req.body;

  if (!roll_no) {
    return res.status(400).send('Roll number is required.');
  }

  // First, get s_id and p_id
  const findStudentQuery = "SELECT s_id, p_id FROM student WHERE s_id = ?";

  db.query(findStudentQuery, [roll_no], (err, result) => {
    if (err) {
      console.error("Database error while finding student:", err);
      return res.status(500).send("Database error.");
    }

    if (result.length === 0) {
      return res.status(404).send("Student not found.");
    }

    const { s_id, p_id } = result[0];

    // Insert default message into notification
    const defaultMessage = "Reminder: Please check your attendance and stay regular!";
    const insertNotificationQuery = "INSERT INTO notification (s_id, msg, p_id) VALUES (?, ?, ?)";

    db.query(insertNotificationQuery, [s_id, defaultMessage, p_id], (err2, result2) => {
      if (err2) {
        console.error("Database error while inserting notification:", err2);
        return res.status(500).send("Failed to insert notification.");
      }

      res.send("Notification successfully sent!");
    });
  });
});




// Start server
app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
