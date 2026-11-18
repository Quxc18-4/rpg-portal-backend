const express = require('express');
const router = express.Router();
const operatorController = require('../controllers/operator.controller');
const { requireAuth, requireMinRole } = require('../middlewares/auth.middleware');

router.use(requireAuth, requireMinRole('MODERATOR'));

// 1. View All toàn server (MODERATOR + ADMIN)
router.get('/players', operatorController.getAllPlayers);
router.get('/waystones', operatorController.getAllWaystones);
router.get('/items/scan', operatorController.scanServerItems);
router.get('/logs', operatorController.getAuditLogs);

// 2. Inspect chi tiết từng người chơi (MODERATOR + ADMIN)
router.get('/players/:username/inspect', operatorController.inspectPlayer);
router.get('/players/:username/inventory', operatorController.inspectPlayerInventory);
router.get('/players/:username/inventory/search', operatorController.searchPlayerInventory);
router.get('/players/:username/jobs', operatorController.inspectPlayerJobs);
router.get('/players/:username/mounts', operatorController.inspectPlayerMounts);
router.get('/players/:username/crops', operatorController.inspectPlayerCrops);
router.get('/players/:username/waystones', operatorController.inspectPlayerWaystones);

// 3. Hàng đợi thực thi lệnh (MODERATOR theo giới hạn policy / ADMIN không giới hạn)
router.post('/players/:username/actions', operatorController.executeAction);

// 4. Đặc quyền quản trị hệ thống (chỉ ADMIN)
router.get('/staff', requireMinRole('ADMIN'), operatorController.getStaffList);
router.patch('/players/:username/role', requireMinRole('ADMIN'), operatorController.assignRole);
router.get('/policy/moderator', requireMinRole('ADMIN'), operatorController.getModeratorPolicy);
router.put('/policy/moderator', requireMinRole('ADMIN'), operatorController.updateModeratorPolicy);

module.exports = router;