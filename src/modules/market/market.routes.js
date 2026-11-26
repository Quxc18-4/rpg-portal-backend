const express = require('express');
const router = express.Router();
const licenseController = require('./license.controller');
const licenseBetController = require('./licenseBet.controller');
const npcLookupController = require('./npcLookup.controller');
const auctionController = require('./auction.controller');
const { optionalAuth, requireAuth } = require('../../middlewares/auth.middleware');

router.get('/licenses', optionalAuth, licenseController.getLicenses);
router.get('/licenses/:itemId/bets', optionalAuth, licenseBetController.getItemBettingPool);
router.post('/licenses/:itemId/bets', requireAuth, licenseBetController.placeBet);
router.get('/npc-lookup', optionalAuth, npcLookupController.searchNpcItems);
// Chợ Đấu Giá (Auction House)
router.get('/auctions', optionalAuth, auctionController.getActiveAuctions);
router.get('/auctions/history', optionalAuth, auctionController.getAuctionHistory);
router.get('/auctions/:id', optionalAuth, auctionController.getAuctionById);

module.exports = router;