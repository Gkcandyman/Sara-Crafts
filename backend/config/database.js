const path = require('path');
const mysql = require('mysql2/promise');

require('dotenv').config({ path: path.resolve(__dirname, '..', '..', '.env') });
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const databaseName = process.env.DB_NAME || 'sara_crafts';

const baseConfig = {
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  waitForConnections: true,
  connectionLimit: 10,
};

let pool;

async function ensureDatabase() {
  const connection = await mysql.createConnection(baseConfig);
  await connection.query(`CREATE DATABASE IF NOT EXISTS \`${databaseName}\``);
  await connection.end();
}

async function getPool() {
  if (!pool) {
    await ensureDatabase();
    pool = mysql.createPool({
      ...baseConfig,
      database: databaseName,
    });
    await migrate();
  }

  return pool;
}

async function migrate() {
  const db = pool;

  await db.query(`
    CREATE TABLE IF NOT EXISTS orders (
      id INT AUTO_INCREMENT PRIMARY KEY,
      request_id VARCHAR(40) NOT NULL UNIQUE,
      name VARCHAR(150) NOT NULL,
      phone VARCHAR(30) NOT NULL,
      service VARCHAR(120) NOT NULL,
      budget VARCHAR(80),
      needed_by DATE,
      details TEXT,
      status VARCHAR(40) DEFAULT 'new',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS appointments (
      id INT AUTO_INCREMENT PRIMARY KEY,
      request_id VARCHAR(40) NOT NULL UNIQUE,
      name VARCHAR(150) NOT NULL,
      phone VARCHAR(30) NOT NULL,
      service VARCHAR(120) NOT NULL,
      preferred_date DATE,
      preferred_time TIME,
      location VARCHAR(255),
      notes TEXT,
      status VARCHAR(40) DEFAULT 'new',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS enquiries (
      id INT AUTO_INCREMENT PRIMARY KEY,
      request_id VARCHAR(40) NOT NULL UNIQUE,
      name VARCHAR(150) NOT NULL,
      phone VARCHAR(30) NOT NULL,
      message TEXT NOT NULL,
      status VARCHAR(40) DEFAULT 'new',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS payments (
      id INT AUTO_INCREMENT PRIMARY KEY,
      request_id VARCHAR(40) NOT NULL UNIQUE,
      name VARCHAR(150) NOT NULL,
      phone VARCHAR(30) NOT NULL,
      amount DECIMAL(10, 2) NOT NULL,
      reference_id VARCHAR(160) NOT NULL,
      purpose VARCHAR(255),
      status VARCHAR(40) DEFAULT 'pending_verification',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await ensureColumn('payments', 'screenshot_name', 'VARCHAR(255)');
  await ensureColumn('payments', 'screenshot_type', 'VARCHAR(120)');
  await ensureColumn('payments', 'screenshot_data', 'LONGTEXT');
}

async function ensureColumn(tableName, columnName, definition) {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS count
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = ?
       AND TABLE_NAME = ?
       AND COLUMN_NAME = ?`,
    [databaseName, tableName, columnName],
  );

  if (!rows[0]?.count) {
    await pool.query(`ALTER TABLE \`${tableName}\` ADD COLUMN \`${columnName}\` ${definition}`);
  }
}

module.exports = {
  getPool,
};
