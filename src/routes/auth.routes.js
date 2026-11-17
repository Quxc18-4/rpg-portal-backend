const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');

router.post('/login', authController.login);
router.get('/discord', authController.discordRedirect);
router.get('/discord/callback', authController.discordCallback);
router.post('/discord/link', authController.linkDiscord);

module.exports = router;