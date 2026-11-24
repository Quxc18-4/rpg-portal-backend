const express = require('express');
const router = express.Router();
const zoneController = require('./zone.controller');
const waystoneController = require('./waystone.controller');
const safezoneController = require('./safezone.controller');
const denController = require('./den.controller');
const ecosystemController = require('./ecosystem.controller');
const serverStatusController = require('../system/serverStatus.controller');
const { optionalAuth } = require('../../middlewares/auth.middleware');

router.get('/zones', zoneController.getZones);
router.get('/waystones', optionalAuth, waystoneController.getWorldWaystones);
router.get('/safezones', safezoneController.getSafezones);
router.get('/dens', denController.getDens);
router.get('/ecosystems', ecosystemController.getEcosystems);
router.get('/server-status', serverStatusController.getStatus);

module.exports = router;