const mongoose = require('mongoose');

class LicenseRepository {
  async findAll() {
    return mongoose.connection.db
      .collection('dens_lisenses')
      .find({})
      .sort({ current_amount: -1, item_id: 1 })
      .toArray();
  }

  async findByItemId(itemId) {
    return mongoose.connection.db
      .collection('dens_lisenses')
      .findOne({ item_id: itemId });
  }
}

module.exports = new LicenseRepository();