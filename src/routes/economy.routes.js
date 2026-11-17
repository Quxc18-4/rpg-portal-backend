const express = require('express');
const router = express.Router();
const economyController = require('../controllers/economy.controller');

router.get('/prices', economyController.getPrices);

module.exports = router;
