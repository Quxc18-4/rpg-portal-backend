const express = require('express');
const router = express.Router();
const operatorController = require('../controllers/operator.controller');
const { requireAuth, requireMinRole } = require('../middlewares/auth.middleware');

// Mọi route trong /operator đều yêu cầu đăng nhập và tối thiểu là MODERATOR
router.use(requireAuth, requireMinRole('MODERATOR'));

// Nhóm quyền R (MODERATOR + ADMIN): Soi dữ liệu người chơi & lịch sử thao tác
router.get('/players/:username/inspect', operatorController.inspectPlayer);
router.get('/players/:username/inventory/search', operatorController.searchPlayerInventory);
router.get('/logs', operatorController.getAuditLogs);

// Nhóm quyền WD (MODERATOR theo giới hạn policy / ADMIN không giới hạn)
router.post('/players/:username/actions', operatorController.executeAction);

// Nhóm đặc quyền chỉ dành riêng cho ADMIN (WRD toàn quyền)
router.get('/staff', requireMinRole('ADMIN'), operatorController.getStaffList);
router.patch('/players/:username/role', requireMinRole('ADMIN'), operatorController.assignRole);
router.get('/policy/moderator', requireMinRole('ADMIN'), operatorController.getModeratorPolicy);
router.put('/policy/moderator', requireMinRole('ADMIN'), operatorController.updateModeratorPolicy);

module.exports = router;