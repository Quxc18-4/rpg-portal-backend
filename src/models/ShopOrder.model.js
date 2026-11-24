const mongoose = require('mongoose');

const shopOrderSchema = new mongoose.Schema(
  {
    orderCode: { type: String, required: true, unique: true, index: true },
    uuid: { type: String, required: true, index: true },
    username: { type: String, required: true },
    packageId: {
      type: String,
      enum: ['VIP_30D', 'UNLOCK_SLOT', 'CLASS_CHANGE_SCROLL', 'ATTR_CHANGE_SCROLL'],
      required: true,
    },
    packageName: { type: String, required: true },
    amountVnd: { type: Number, required: true },
    quantity: { type: Number, default: 1 },
    status: {
      type: String,
      enum: ['PENDING', 'PAID', 'CANCELLED', 'FAILED'],
      default: 'PENDING',
      index: true,
    },
    paymentRef: { type: String, default: null },
    approvedBy: { type: String, default: null },
    paidAt: { type: Date, default: null },
  },
  { collection: 'web_shop_orders', timestamps: true }
);

module.exports = mongoose.model('ShopOrder', shopOrderSchema);