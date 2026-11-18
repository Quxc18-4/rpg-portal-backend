const mongoose = require('mongoose');

class DenRepository {
  async findAll() {
    return mongoose.connection.db.collection('world_dens').find({}).toArray();
  }
}

module.exports = new DenRepository();