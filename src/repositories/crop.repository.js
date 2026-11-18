const mongoose = require('mongoose');

class CropRepository {
  async findByUuid(uuid) {
    return mongoose.connection.db.collection('crops').findOne({ _id: uuid });
  }

  async findAllOwnerUuids() {
    const docs = await mongoose.connection.db
      .collection('crops')
      .find({}, { projection: { _id: 1 } })
      .toArray();
    return docs.map((d) => d._id);
  }
}

module.exports = new CropRepository();