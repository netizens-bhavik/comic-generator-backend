import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306'),
  user: process.env.DB_USER || 'valet',
  password: process.env.DB_PASSWORD || 'Admin@0056',
  database: process.env.DB_NAME || 'comic_generator',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

export default pool;

