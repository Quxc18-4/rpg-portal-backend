const express = require('express');
const router = express.Router();
const shopController = require('./shop.controller');
const { requireAuth, requireMinRole } = require('../../middlewares/auth.middleware');

// Công khai: Xem danh sách gói bán trên Web
router.get('/packages', shopController.getPackages);

// Webhook thanh toán tự động (xác thực qua x-webhook-secret)
router.post('/webhook', shopController.handlePaymentWebhook);

// Người chơi đã đăng nhập
router.post('/vip/purchase-gold', requireAuth, shopController.purchaseVipWithGold);
router.post('/purchase-gold', requireAuth, shopController.purchaseVipWithGold); // Khớp /api/v1/vip/purchase-gold
router.post('/orders', requireAuth, shopController.createOrder);
router.get('/orders/me', requireAuth, shopController.getMyOrders);

// Admin quản lý & duyệt đơn thủ công
router.get('/admin/orders', requireAuth, requireMinRole('ADMIN'), shopController.getAllOrdersAdmin);
router.post(
  '/admin/orders/:orderCode/approve',
  requireAuth,
  requireMinRole('ADMIN'),
  shopController.approveOrderAdmin
);

module.exports = router;