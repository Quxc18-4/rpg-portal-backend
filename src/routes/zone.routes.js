const express = require('express');
const router = express.Router();
const zoneController = require('../controllers/zone.controller');
const waystoneController = require('../controllers/waystone.controller');
const { optionalAuth } = require('../middlewares/auth.middleware');

router.get('/zones', zoneController.getZones);
router.get('/waystones', optionalAuth, waystoneController.getWorldWaystones);

module.exports = router;
