const cron = require('node-cron');
const db = require('../config/db');

const startCleanupJob = () => {
  cron.schedule('0 2 * * *', async () => {
    try {
      const result = await db.query('SELECT clean_expired_sessions() AS deleted_count');
      // eslint-disable-next-line no-console
      console.log(`Session cleanup removed ${Number(result.rows[0]?.deleted_count || 0)} expired sessions`);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Session cleanup job failed:', error.message);
    }
  });
};

module.exports = {
  startCleanupJob
};
