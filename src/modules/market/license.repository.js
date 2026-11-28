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

  async findRecentHistoryByItemIds(itemIds = [], limitPerItem = 3) {
    if (!Array.isArray(itemIds) || itemIds.length === 0) {
      return new Map();
    }

    try {
      const rows = await mongoose.connection.db
        .collection('dens_license_history')
        .find({ item_id: { $in: itemIds } })
        .sort({ completed_at: -1, settledAt: -1 })
        .toArray();

      const grouped = new Map();
      for (const row of rows) {
        const list = grouped.get(row.item_id) || [];
        if (list.length < limitPerItem) {
          list.push(row);
          grouped.set(row.item_id, list);
        }
      }
      return grouped;
    } catch {
      return new Map();
    }
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