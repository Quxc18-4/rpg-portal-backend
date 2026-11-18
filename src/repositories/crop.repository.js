const mongoose = require('mongoose');

class CropRepository {
  async findByUuid(uuid) {
    return mongoose.connection.db.collection('Crop').findOne({ _id: uuid });
  }
}

module.exports = new CropRepository();