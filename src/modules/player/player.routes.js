const express = require('express');
const router = express.Router();
const playerController = require('./player.controller');
const { requireAuth, optionalAuth } = require('../../middlewares/auth.middleware');
const jobController = require('./job.controller');
const mountController = require('./mount.controller');
const cropController = require('../world/crop.controller');
const waystoneController = require('../world/waystone.controller');
const rewardController = require('./reward.controller');
const licenseBetController = require('../market/licenseBet.controller');

router.get('/leaderboard', playerController.getLeaderboard);
router.get('/me', requireAuth, playerController.getMe);
router.get('/me/inventory', requireAuth, playerController.getMyInventory);
router.get('/me/inventory/search', requireAuth, playerController.searchMyInventory);
router.get('/me/jobs', requireAuth, jobController.getMyJobs);
router.get('/me/mounts', requireAuth, mountController.getMyMounts);
router.get('/me/crops', requireAuth, cropController.getMyCrops);
router.get('/me/waystones', requireAuth, waystoneController.getMyWaystones);
router.get('/me/rewards', requireAuth, rewardController.getMyRewards);
router.get('/me/licenses/bets', requireAuth, licenseBetController.getMyBets);
router.get('/:username', optionalAuth, playerController.getProfile);

module.exports = router;