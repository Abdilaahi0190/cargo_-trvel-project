const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');
dotenv.config({ path: path.resolve(__dirname, '.env') });
dotenv.config({ path: path.resolve(__dirname, '.env.example'), override: false });

const app = require('./src/app.js');
const db = require('./src/config/db.js');
const { startCleanupJob } = require('./src/jobs/cleanSessions.js');

const PORT = parseInt(process.env.PORT, 10) || 9999;

process.on('uncaughtException', (error) => {
  // eslint-disable-next-line no-console
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  // eslint-disable-next-line no-console
  console.error('Unhandled Rejection:', reason);
  process.exit(1);
});

const startServer = async () => {
  await db.testConnection();
  startCleanupJob();
  fs.mkdirSync(path.resolve(__dirname, 'uploads'), { recursive: true });

  app.listen(PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`Server running on port ${PORT}`);
  });
};

startServer().catch((error) => {
  // eslint-disable-next-line no-console
  console.error('Failed to start server:', error);
  process.exit(1);
});
