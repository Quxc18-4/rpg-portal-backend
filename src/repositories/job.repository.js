const mongoose = require('mongoose');

class JobRepository {
  async findByUuid(uuid) {
    return mongoose.connection.db.collection('player_jobs').findOne({ _id: uuid });
  }
}

module.exports = new JobRepository();