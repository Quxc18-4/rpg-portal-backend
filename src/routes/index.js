const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const ApiResponse = require('../utils/apiResponse.util');

router.get('/health', async (req, res, next) => {
  try {
    const dbName = mongoose.connection.name;
    const readyState = mongoose.connection.readyState; // 1 = connected
    const playerCount = await mongoose.connection.db.collection('players').countDocuments();

    ApiResponse.success(
      res,
      {
        uptime: process.uptime(),
        mongodb: {
          status: readyState === 1 ? 'CONNECTED' : 'DISCONNECTED',
          database: dbName,
          playersCount: playerCount,
        },
      },
      'RPG Portal API is running'
    );
  } catch (error) {
    next(error);
  }
});

router.use('/auth', require('../modules/auth/auth.routes'));
router.use('/players', require('../modules/player/player.routes'));
router.use('/guilds', require('../modules/guild/guild.routes'));
router.use('/market', require('../modules/market/economy.routes'));
router.use('/world', require('../modules/world/zone.routes'));
router.use('/market', require('../modules/market/market.routes'));
router.use('/operator', require('../modules/operator/operator.routes'));
router.use('/shop', require('../modules/shop/shop.routes'));
router.use('/vip', require('../modules/shop/shop.routes')); // Alias tương thích /api/v1/vip/purchase-gold

module.exports = router;