// ============================================================
// CAU HINH KET NOI DATABASE POSTGRESQL + POSTGIS (dbConfig.js)
// ============================================================
const { Pool } = require('pg');
require('dotenv').config();

// Khoi tao Pool ket noi Database
const pool = new Pool({
    user: process.env.DB_USER || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'vnpt_netguard',
    password: process.env.DB_PASSWORD || 'password',
    port: process.env.DB_PORT || 5432,
});

// Kiem tra ket noi
pool.on('connect', () => {
    console.log('[DB] Da ket noi thanh cong toi PostgreSQL (PostGIS)!');
});

pool.on('error', (err) => {
    console.error('[DB ERROR] Loi ket noi PostgreSQL bat ngo:', err);
    process.exit(-1);
});

module.exports = {
    query: (text, params) => pool.query(text, params),
    pool
};
