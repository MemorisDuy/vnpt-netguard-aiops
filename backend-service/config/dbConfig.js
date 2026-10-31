// ============================================================
// CẤU HÌNH KẾT NỐI DATABASE POSTGRESQL + POSTGIS (dbConfig.js)
// ============================================================
const { Pool } = require('pg');
require('dotenv').config();

// Khởi tạo Pool kết nối Database
const pool = new Pool({
    user: process.env.DB_USER || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'vnpt_netguard',
    password: process.env.DB_PASSWORD || 'password',
    port: process.env.DB_PORT || 5432,
});

// Kiểm tra kết nối
pool.on('connect', () => {
    console.log('✅ Đã kết nối thành công tới PostgreSQL (PostGIS)!');
});

pool.on('error', (err) => {
    console.error('❌ Lỗi kết nối PostgreSQL bất ngờ:', err);
    process.exit(-1);
});

module.exports = {
    query: (text, params) => pool.query(text, params),
    pool
};
