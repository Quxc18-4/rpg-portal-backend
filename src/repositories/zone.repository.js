const Zone = require('../models/Zone.model');

class ZoneRepository {
  async getAllActiveZones() {
    return Zone.find({}).lean();
  }
}

module.exports = new ZoneRepository();
