const mongoose = require('mongoose');

class SafezoneRepository {
  async findAll() {
    return mongoose.connection.db.collection('safezones').find({}).toArray();
  }
}

module.exports = new SafezoneRepository();