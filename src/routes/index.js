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

router.use('/auth', require('./auth.routes'));

router.use('/players', require('./player.routes'));
router.use('/market', require('./economy.routes'));
router.use('/world', require('./zone.routes'));
router.use('/operator', require('./operator.routes'));

module.exports = router;
