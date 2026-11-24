const express = require('express');
const router = express.Router();
const economyController = require('./economy.controller');

router.get('/prices', economyController.getPrices);

module.exports = router;
