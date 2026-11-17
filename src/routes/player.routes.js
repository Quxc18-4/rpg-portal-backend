const express = require('express');
const router = express.Router();
const playerController = require('../controllers/player.controller');
const { optionalAuth } = require('../middlewares/auth.middleware');

router.get('/leaderboard', playerController.getLeaderboard);
router.get('/:username', optionalAuth, playerController.getProfile);

module.exports = router;
