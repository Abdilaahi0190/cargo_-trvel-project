const path = require('path');
const { Pool } = require('pg');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../.env.example'), override: false });

const pool = new Pool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD || '',
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
});

const setUserContext = async (client, userId) => {
  await client.query(
    `SELECT set_config('myapp.user_id', $1::text, false)`,
    [String(userId)]
  );
};

const clearUserContext = async (client) => {
  await client.query(
    `SELECT set_config('myapp.user_id', '', false)`
  );
};

const testConnection = async () => {
  let client;

  try {
    client = await pool.connect();
    await client.query('SELECT 1');
    // eslint-disable-next-line no-console
    console.log('Database connection successful');
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Database connection failed:', error.message);
    process.exit(1);
  } finally {
    if (client) {
      client.release();
    }
  }
};

const query = (sql, params = []) => pool.query(sql, params);

const queryWithUser = async (sql, params = [], userId) => {
  const client = await pool.connect();

  try {
    await setUserContext(client, userId);
    return await client.query(sql, params);
  } finally {
    try {
      await clearUserContext(client);
    } catch (clearError) {
      // eslint-disable-next-line no-console
      console.error('Failed to clear database user context:', clearError.message);
    }
    client.release();
  }
};

module.exports = {
  pool,
  query,
  queryWithUser,
  setUserContext,
  clearUserContext,
  testConnection
};
