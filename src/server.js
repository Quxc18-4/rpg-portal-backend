require('dotenv').config();
const app = require('./app');
const connectDB = require('./config/db');
const licenseBetRepo = require('./repositories/licenseBet.repository');
const licenseBetService = require('./services/licenseBet.service');

const PORT = process.env.PORT || 5000;

connectDB().then(async () => {
  try {
    await licenseBetRepo.ensureIndexes();
    licenseBetService.startSettlementWorker();
  } catch (err) {
    console.error('[LicenseBet] Lỗi khởi tạo index/worker:', err);
  }

  app.listen(PORT, () => {
    console.log(`[Server] RPG Portal Backend running at http://localhost:${PORT}/api/v1`);
  });
});