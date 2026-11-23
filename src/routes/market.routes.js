const express = require('express');
const router = express.Router();
const licenseController = require('../controllers/license.controller');
const { optionalAuth } = require('../middlewares/auth.middleware');

router.get('/licenses', optionalAuth, licenseController.getLicenses);

module.exports = router;