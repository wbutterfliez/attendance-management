const express = require('express');
const mysql = require('mysql2');
const bodyParser = require('body-parser');
const app = express();
const port = 3000;

app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public')); // Your HTML/CSS/JS files here

// MySQL connection
const db = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: 'm2806',
  database: 'attendance-system'
});

db.connect((err) => {
  if (err) throw err;
  console.log('✅ Connected to MySQL!');
});

// Route to handle attendance marking
app.post('/mark_attendance', (req, res) => {
  const updates = [];

  db.query('SELECT s_id FROM student', (err, results) => {
    if (err) throw err;

    results.forEach(student => {
      const isPresent = req.body[`present_${student.s_id}`] ? 1 : 0;
      const updateQuery = `
        INSERT INTO attendance (s_id, total_days, present_days, p_id)
        VALUES (?, 1, ?, 0)
        ON DUPLICATE KEY UPDATE
        total_days = total_days + 1,
        present_days = present_days + VALUES(present_days)
      `;
      updates.push(new Promise((resolve, reject) => {
        db.query(updateQuery, [student.s_id, isPresent], (err, result) => {
          if (err) reject(err);
          else resolve();
        });
      }));
    });

    Promise.all(updates)
      .then(() => res.send('Attendance submitted successfully!'))
      .catch(err => res.status(500).send('Error updating attendance.'));
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
    console.log("Request Body:", req.body); // Log the entire body to check form data
    
    const { s_id, message } = req.body;
    
    if (!s_id || !message) {
      return res.status(400).send("Missing student ID or message.");
    }
    
    const getPidQuery = `SELECT p_id FROM student WHERE s_id = ?`;
    
    db.query(getPidQuery, [s_id], (err, result) => {
      if (err) {
        console.error("Database error while fetching parent ID:", err);
        return res.status(500).send("Unable to send notification (DB error).");
      }
    
      console.log("Parent ID Query Result:", result);  // Log the result of the query
      
      if (!result || result.length === 0) {
        console.error("No student found with that s_id:", s_id);
        return res.status(404).send("Unable to send notification (Student not found).");
      }
    
      const p_id = result[0].p_id;
    
      const insertQuery = `
        INSERT INTO notification (s_id, msg, p_id)
        VALUES (?, ?, ?)
      `;
    
      db.query(insertQuery, [s_id, message, p_id], (err2, result2) => {
        if (err2) {
          console.error("Failed to insert notification:", err2);
          return res.status(500).send("Notification failed to save.");
        }
    
        res.sendFile(__dirname + "/notification_sent.html");
      });
    });
  });
  
  
  
  

  

app.listen(port, () => {
  console.log(`🚀 Server running on http://localhost:${port}`);
});
