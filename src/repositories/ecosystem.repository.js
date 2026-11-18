const mongoose = require('mongoose');

class EcosystemRepository {
  async findAll() {
    return mongoose.connection.db.collection('world_ecosystems').find({}).toArray();
  }
}

module.exports = new EcosystemRepository();