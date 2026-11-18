const express = require('express');
const router = express.Router();
const playerController = require('../controllers/player.controller');
const { requireAuth, optionalAuth } = require('../middlewares/auth.middleware');

router.get('/leaderboard', playerController.getLeaderboard);
router.get('/me', requireAuth, playerController.getMe);
router.get('/me/inventory', requireAuth, playerController.getMyInventory);
router.get('/me/inventory/search', requireAuth, playerController.searchMyInventory);
router.get('/:username', optionalAuth, playerController.getProfile);

module.exports = router;