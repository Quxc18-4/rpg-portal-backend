const express = require('express');
const router = express.Router();
const licenseController = require('./license.controller');
const licenseBetController = require('./licenseBet.controller');
const npcLookupController = require('./npcLookup.controller');
const { optionalAuth, requireAuth } = require('../../middlewares/auth.middleware');

router.get('/licenses', optionalAuth, licenseController.getLicenses);
router.get('/licenses/:itemId/bets', optionalAuth, licenseBetController.getItemBettingPool);
router.post('/licenses/:itemId/bets', requireAuth, licenseBetController.placeBet);
router.get('/npc-lookup', optionalAuth, npcLookupController.searchNpcItems);

module.exports = router;