const express = require('express');
const router = express.Router();
const licenseController = require('../controllers/license.controller');
const licenseBetController = require('../controllers/licenseBet.controller');
const { optionalAuth, requireAuth } = require('../middlewares/auth.middleware');

router.get('/licenses', optionalAuth, licenseController.getLicenses);
router.get('/licenses/:itemId/bets', optionalAuth, licenseBetController.getItemBettingPool);
router.post('/licenses/:itemId/bets', requireAuth, licenseBetController.placeBet);

module.exports = router;