// db.js
const mysql = require('mysql2');

const db = mysql.createConnection({
  host: 'localhost',
  user: 'root',        // or your username
  password: 'm2806',        // or your MySQL password
  database: 'attendance-system'
});

db.connect((err) => {
  if (err) throw err;
  console.log('MySQL connected!');
});

module.exports = db;
