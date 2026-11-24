const crypto = require('crypto');
const PlayerAccount = require('../../models/PlayerAccount.model');
const OperatorAction = require('../../models/OperatorAction.model');
const ShopOrder = require('../../models/ShopOrder.model');
const { AppError } = require('../../utils/error.util');

const DAY_MILLIS = 86_400_000;
const VIP_GOLD_COST = 100;
const VIP_COPPER_COST = 100 * 4096; // 409,600 Đồng
const VIP_DURATION_DAYS = 30;

const SHOP_PACKAGES = {
  VIP_30D: {
    id: 'VIP_30D',
    name: 'Gói Đặc Quyền VIP (30 Ngày)',
    description:
      'Tiền tố [VIP] nổi bật trên Chat/Tablist, ưu tiên vào server khi đầy slot, mở khóa chỉ đường NPC/Waystone trên Web và tặng vĩnh viễn +1 Slot nhân vật ở lần mua đầu tiên.',
    priceVnd: 50000,
    goldPrice: VIP_GOLD_COST,
    type: 'VIP',
  },
  UNLOCK_SLOT: {
    id: 'UNLOCK_SLOT',
    name: 'Mở Khóa Thêm 1 Slot Nhân Vật',
    description:
      'Mở khóa vĩnh viễn +1 Slot nhân vật tiếp theo cho tài khoản (tối đa 10 Slot). Dùng lệnh /slot trong game để chuyển đổi.',
    priceVnd: 50000,
    goldPrice: null,
    type: 'SLOT',
  },
  CLASS_CHANGE_SCROLL: {
    id: 'CLASS_CHANGE_SCROLL',
    name: 'Chuyển Chức Lệnh Bài',
    description:
      'Dùng khi đổi Chức Nghiệp trong /class để giữ nguyên toàn bộ Cấp độ và Điểm Tiềm Năng hiện tại.',
    priceVnd: 30000,
    goldPrice: null,
    itemId: 'class_change_scroll',
    type: 'ITEM',
  },
  ATTR_CHANGE_SCROLL: {
    id: 'ATTR_CHANGE_SCROLL',
    name: 'Cuộn Giấy Tái Lập Chỉ Số',
    description:
      'Dùng tại /attr để hoàn trả 100% điểm tiềm năng đã cộng mà không tốn 10 Vàng.',
    priceVnd: 10000,
    goldPrice: null,
    itemId: 'attr_change',
    type: 'ITEM',
  },
};

class ShopService {
  getPackages() {
    return Object.values(SHOP_PACKAGES);
  }

  /**
   * Mua VIP 30 ngày bằng 100 Vàng (409,600 Đồng) từ Slot đang chơi
   */
  async purchaseVipWithGold(user) {
    const existingPending = await OperatorAction.findOne({
      targetUuid: user.uuid,
      action: 'BUY_VIP_GOLD',
      status: { $in: ['PENDING', 'PROCESSING'] },
    }).lean();

    if (existingPending) {
      throw new AppError('VIP_PURCHASE_PENDING_IN_PROGRESS', 429);
    }

    const queued = await OperatorAction.create({
      actorUuid: user.uuid,
      actorUsername: user.username,
      actorRole: user.role || 'USER',
      targetUuid: user.uuid,
      targetUsername: user.username,
      action: 'BUY_VIP_GOLD',
      payload: {
        targetUuid: user.uuid,
        goldCost: VIP_GOLD_COST,
        copperCost: VIP_COPPER_COST,
        days: VIP_DURATION_DAYS,
      },
      reason: `Mua gói VIP 30 ngày bằng ${VIP_GOLD_COST} Vàng trên Web Portal`,
      status: 'PENDING',
    });

    return {
      actionId: String(queued._id),
      status: queued.status,
      goldCost: VIP_GOLD_COST,
      copperCost: VIP_COPPER_COST,
      durationDays: VIP_DURATION_DAYS,
    };
  }

  /**
   * Tạo đơn hàng nạp tiền / chuyển khoản trên Web Portal
   */
  async createOrder(user, packageId, quantity = 1) {
    const pkg = SHOP_PACKAGES[String(packageId || '').toUpperCase()];
    if (!pkg) {
      throw AppError.badRequest('SHOP_INVALID_PACKAGE');
    }

    const safeQty = pkg.type === 'ITEM' ? Math.min(20, Math.max(1, Number(quantity) || 1)) : 1;

    if (pkg.id === 'UNLOCK_SLOT') {
      const account = await PlayerAccount.findById(user.uuid).lean();
      const vipState = PlayerAccount.resolveAccountVipState(account);
      if (vipState.maxSlots >= PlayerAccount.MAX_ALLOWED_SLOTS) {
        throw AppError.badRequest('SHOP_MAX_SLOTS_REACHED');
      }
    }

    const randomSuffix = crypto.randomBytes(3).toString('hex').toUpperCase();
    const orderCode = `RPG${Date.now().toString().slice(-6)}${randomSuffix}`;
    const totalAmountVnd = pkg.priceVnd * safeQty;

    const order = await ShopOrder.create({
      orderCode,
      uuid: user.uuid,
      username: user.username,
      packageId: pkg.id,
      packageName: pkg.name,
      amountVnd: totalAmountVnd,
      quantity: safeQty,
      status: 'PENDING',
    });

    return {
      orderId: String(order._id),
      orderCode: order.orderCode,
      packageId: order.packageId,
      packageName: order.packageName,
      quantity: order.quantity,
      amountVnd: order.amountVnd,
      transferContent: order.orderCode,
      status: order.status,
      createdAt: order.createdAt,
    };
  }

  /**
   * Xử lý kích hoạt gói sau khi Webhook thanh toán báo về hoặc Admin duyệt đơn
   */
  async fulfillOrder(orderCode, { paymentRef = null, approvedBy = 'SYSTEM' } = {}) {
    const cleanCode = String(orderCode || '').trim().toUpperCase();
    const order = await ShopOrder.findOne({ orderCode: cleanCode });
    if (!order) {
      throw AppError.notFound('SHOP_ORDER_NOT_FOUND');
    }

    if (order.status !== 'PENDING') {
      throw AppError.badRequest('SHOP_ORDER_ALREADY_PROCESSED');
    }

    const account = await PlayerAccount.findById(order.uuid).lean();
    if (!account) {
      throw AppError.notFound('ACCOUNT_NOT_FOUND');
    }

    const pkg = SHOP_PACKAGES[order.packageId];
    if (!pkg) {
      throw AppError.badRequest('SHOP_INVALID_PACKAGE');
    }

    // 1. Kích hoạt gói VIP 30 ngày (+1 slot ở lần đầu mua VIP)
    if (order.packageId === 'VIP_30D') {
      const now = Date.now();
      const currentExpiry = Number(account.vip_expires_at || 0);
      const baseTime = Math.max(currentExpiry, now);
      const newExpiry = baseTime + VIP_DURATION_DAYS * DAY_MILLIS;

      const updateSet = {
        is_vip: true,
        vip_expires_at: newExpiry,
      };

      const hasUnlockedSlot = Boolean(account.has_unlocked_vip_slot);
      if (!hasUnlockedSlot) {
        const currentMax = Number(account.max_slots || PlayerAccount.DEFAULT_MAX_SLOTS);
        updateSet.max_slots = Math.min(PlayerAccount.MAX_ALLOWED_SLOTS, currentMax + 1);
        updateSet.has_unlocked_vip_slot = true;
      }

      await PlayerAccount.updateOne({ _id: order.uuid }, { $set: updateSet });

      // Đẩy REFRESH_VIP để plugin cập nhật [VIP] ngay nếu người chơi đang online
      await OperatorAction.create({
        actorUuid: order.uuid,
        actorUsername: approvedBy,
        actorRole: approvedBy === 'SYSTEM' ? 'SYSTEM' : 'ADMIN',
        targetUuid: order.uuid,
        targetUsername: order.username,
        action: 'REFRESH_VIP',
        payload: {
          targetUuid: order.uuid,
          vipExpiresAt: newExpiry,
          unlockedSlotNow: !hasUnlockedSlot,
        },
        reason: `Thanh toán thành công đơn ${order.orderCode} (${pkg.name})`,
        status: 'PENDING',
      });
    }

    // 2. Mở khóa thêm +1 Slot nhân vật
    else if (order.packageId === 'UNLOCK_SLOT') {
      const currentMax = Number(account.max_slots || PlayerAccount.DEFAULT_MAX_SLOTS);
      if (currentMax >= PlayerAccount.MAX_ALLOWED_SLOTS) {
        throw AppError.badRequest('SHOP_MAX_SLOTS_REACHED');
      }

      await OperatorAction.create({
        actorUuid: order.uuid,
        actorUsername: approvedBy,
        actorRole: approvedBy === 'SYSTEM' ? 'SYSTEM' : 'ADMIN',
        targetUuid: order.uuid,
        targetUsername: order.username,
        action: 'UNLOCK_SLOT',
        payload: {
          targetUuid: order.uuid,
        },
        reason: `Thanh toán thành công đơn ${order.orderCode} (${pkg.name})`,
        status: 'PENDING',
      });
    }

    // 3. Giao vật phẩm RPG (Chuyển Chức Lệnh Bài / Cuộn Tái Lập Chỉ Số)
    else if (pkg.type === 'ITEM') {
      await OperatorAction.create({
        actorUuid: order.uuid,
        actorUsername: approvedBy,
        actorRole: approvedBy === 'SYSTEM' ? 'SYSTEM' : 'ADMIN',
        targetUuid: order.uuid,
        targetUsername: order.username,
        action: 'GIVE_RPG_ITEM',
        payload: {
          targetUuid: order.uuid,
          itemId: pkg.itemId,
          amount: order.quantity,
        },
        reason: `Thanh toán thành công đơn ${order.orderCode} (${order.quantity}x ${pkg.name})`,
        status: 'PENDING',
      });
    }

    order.status = 'PAID';
    order.paymentRef = paymentRef;
    order.approvedBy = approvedBy;
    order.paidAt = new Date();
    await order.save();

    return order.toObject();
  }

  async getMyOrders(uuid) {
    return ShopOrder.find({ uuid }).sort({ createdAt: -1 }).limit(50).lean();
  }

  async getAllOrdersAdmin({ status, limit = 50 } = {}) {
    const filter = {};
    if (status) filter.status = String(status).toUpperCase();
    return ShopOrder.find(filter)
      .sort({ createdAt: -1 })
      .limit(Math.min(200, Math.max(1, Number(limit) || 50)))
      .lean();
  }
}

module.exports = new ShopService();