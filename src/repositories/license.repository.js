const mongoose = require('mongoose');

class LicenseRepository {
  async findAll() {
    return mongoose.connection.db
      .collection('dens_licenses')
      .find({})
      .sort({ current_amount: -1, item_id: 1 })
      .toArray();
  }

  async findByItemId(itemId) {
    return mongoose.connection.db
      .collection('dens_licenses')
      .findOne({ item_id: itemId });
  }

  async findPaginated({ filter = {}, page = 1, limit = 20 } = {}) {
    const col = mongoose.connection.db.collection('dens_licenses');
    const skip = (page - 1) * limit;

    const [items, totalItems, totalPools, activePoolsCount] = await Promise.all([
      col
        .find(filter)
        .sort({ current_amount: -1, item_id: 1 })
        .skip(skip)
        .limit(limit)
        .toArray(),
      col.countDocuments(filter),
      col.countDocuments({}),
      col.countDocuments({ current_amount: { $gt: 0 } }),
    ]);

    return {
      items,
      totalItems,
      summary: {
        totalPools,
        activePoolsCount,
      },
    };
  }
}

module.exports = new LicenseRepository();