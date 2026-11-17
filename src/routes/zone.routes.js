const express = require('express');
const router = express.Router();
const zoneController = require('../controllers/zone.controller');

router.get('/zones', zoneController.getZones);

module.exports = router;
