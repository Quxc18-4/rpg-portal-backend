const mongoose = require('mongoose');

const economySchema = new mongoose.Schema(
  {
    _id: String,
    base_buy_price: Number,
    base_sell_price: Number,
    total_bought: Number,
    total_sold: Number,
    pending_bought: Number,
    pending_sold: Number,
  },
  { collection: 'global_economy', strict: false }
);

module.exports = mongoose.model('Economy', economySchema);
