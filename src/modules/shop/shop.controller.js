const shopService = require('./shop.service');
const ApiResponse = require('../../utils/apiResponse.util');

class ShopController {
  getPackages(req, res) {
    const packages = shopService.getPackages();
    return ApiResponse.success(res, packages, 'SHOP_PACKAGES_SUCCESS');
  }

  async purchaseVipWithGold(req, res, next) {
    try {
      const data = await shopService.purchaseVipWithGold(req.user);
      return ApiResponse.success(res, data, 'VIP_GOLD_PURCHASE_QUEUED', 201);
    } catch (error) {
      next(error);
    }
  }

  async createOrder(req, res, next) {
    try {
      const { packageId, quantity } = req.body;
      const data = await shopService.createOrder(req.user, packageId, quantity);
      return ApiResponse.success(res, data, 'SHOP_ORDER_CREATED', 201);
    } catch (error) {
      next(error);
    }
  }

  async getMyOrders(req, res, next) {
    try {
      const data = await shopService.getMyOrders(req.user.uuid);
      return ApiResponse.success(res, data, 'SHOP_ORDERS_LIST_SUCCESS');
    } catch (error) {
      next(error);
    }
  }

  /**
   * Webhook thanh toán tự động (SePay / Casso / Cổng thanh toán)
   * Bắt buộc gửi header x-webhook-secret khớp process.env.PAYMENT_WEBHOOK_SECRET
   */
  async handlePaymentWebhook(req, res, next) {
    try {
      const secret = req.headers['x-webhook-secret'];
      if (!process.env.PAYMENT_WEBHOOK_SECRET || secret !== process.env.PAYMENT_WEBHOOK_SECRET) {
        return ApiResponse.error(res, 'INVALID_WEBHOOK_SECRET', 401);
      }

      // Hỗ trợ truyền thẳng orderCode hoặc trích xuất mã RPG... từ nội dung chuyển khoản (content/description)
      const rawContent = String(
        req.body.orderCode || req.body.content || req.body.description || ''
      ).toUpperCase();
      const match = rawContent.match(/RPG[A-Z0-9]{12}/);
      const extractedCode = match ? match[0] : rawContent.trim();

      const paymentRef = req.body.transactionId || req.body.referenceCode || null;
      const data = await shopService.fulfillOrder(extractedCode, {
        paymentRef,
        approvedBy: 'SYSTEM',
      });

      return ApiResponse.success(res, data, 'SHOP_ORDER_PAID_SUCCESS');
    } catch (error) {
      next(error);
    }
  }

  async getAllOrdersAdmin(req, res, next) {
    try {
      const data = await shopService.getAllOrdersAdmin(req.query);
      return ApiResponse.success(res, data, 'SHOP_ORDERS_LIST_SUCCESS');
    } catch (error) {
      next(error);
    }
  }

  async approveOrderAdmin(req, res, next) {
    try {
      const data = await shopService.fulfillOrder(req.params.orderCode, {
        paymentRef: req.body?.paymentRef || 'ADMIN_MANUAL',
        approvedBy: req.user.username,
      });
      return ApiResponse.success(res, data, 'SHOP_ORDER_PAID_SUCCESS');
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new ShopController();