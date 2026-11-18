const express = require('express');
const router = express.Router();
const playerController = require('../controllers/player.controller');
const { requireAuth, optionalAuth } = require('../middlewares/auth.middleware');
const jobController = require('../controllers/job.controller');
const mountController = require('../controllers/mount.controller');
const cropController = require('../controllers/crop.controller');
const waystoneController = require('../controllers/waystone.controller');
const rewardController = require('../controllers/reward.controller');

router.get('/leaderboard', playerController.getLeaderboard);
router.get('/me', requireAuth, playerController.getMe);
router.get('/me/inventory', requireAuth, playerController.getMyInventory);
router.get('/me/inventory/search', requireAuth, playerController.searchMyInventory);
router.get('/me/jobs', requireAuth, jobController.getMyJobs);
router.get('/me/mounts', requireAuth, mountController.getMyMounts);
router.get('/me/crops', requireAuth, cropController.getMyCrops);
router.get('/me/waystones', requireAuth, waystoneController.getMyWaystones);
router.get('/me/rewards', requireAuth, rewardController.getMyRewards);
router.get('/:username', optionalAuth, playerController.getProfile);

module.exports = router;