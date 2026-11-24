const Economy = require('../../models/Economy.model');

class EconomyRepository {
  async getAllItems() {
    return Economy.find({}).lean();
  }
}

module.exports = new EconomyRepository();
