const express = require('express');
const router = express.Router();
const ApiResponse = require('../utils/apiResponse.util');

router.get('/health', (req, res) => {
  ApiResponse.success(res, { uptime: process.uptime() }, 'RPG Portal API is running');
});

router.use('/players', require('./player.routes'));
router.use('/market', require('./economy.routes'));
router.use('/world', require('./zone.routes'));

module.exports = router;
