const mysql = require('mysql2');
const dotenv = require('dotenv');

dotenv.config();

console.log('DB_HOST:', process.env.DB_HOST);
console.log('DB_USER:', process.env.DB_USER);
console.log('DB_PASSWORD:', process.env.DB_PASSWORD);
console.log('DB_NAME:', process.env.DB_NAME);

const connection = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT || 3306,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

const testConnection = () => {
  connection.getConnection((err, conn) => {
    if (err) {
      console.error('Error connecting to MySQL:', err.message);
      process.exit(1);
    }
    console.log('Connected to MySQL as ID', conn.threadId);
    conn.release();
    process.exit(0); 
  });
};

if (require.main === module) {
  testConnection();
}

module.exports = connection;
