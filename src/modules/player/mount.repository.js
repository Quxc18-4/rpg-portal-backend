const mongoose = require('mongoose');

class MountRepository {
  async findByUuid(uuid) {
    return mongoose.connection.db.collection('player_mounts').findOne({ _id: uuid });
  }
}

module.exports = new MountRepository();