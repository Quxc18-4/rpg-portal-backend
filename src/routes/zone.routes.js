const express = require('express');
const router = express.Router();
const zoneController = require('../controllers/zone.controller');
const waystoneController = require('../controllers/waystone.controller');
const safezoneController = require('../controllers/safezone.controller');
const denController = require('../controllers/den.controller');
const ecosystemController = require('../controllers/ecosystem.controller');
const serverStatusController = require('../controllers/serverStatus.controller');
const { optionalAuth } = require('../middlewares/auth.middleware');

router.get('/zones', zoneController.getZones);
router.get('/waystones', optionalAuth, waystoneController.getWorldWaystones);
router.get('/safezones', safezoneController.getSafezones);
router.get('/dens', denController.getDens);
router.get('/ecosystems', ecosystemController.getEcosystems);
router.get('/server-status', serverStatusController.getStatus);

module.exports = router;