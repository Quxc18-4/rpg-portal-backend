const express = require('express');
const router = express.Router();
const guildController = require('./guild.controller');
const { requireAuth, optionalAuth } = require('../../middlewares/auth.middleware');

router.get('/', guildController.getGuilds);
router.get('/me', requireAuth, guildController.getMyGuild);
router.get('/:id', optionalAuth, guildController.getGuildById);

module.exports = router;