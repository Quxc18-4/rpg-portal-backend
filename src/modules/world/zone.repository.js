const Zone = require('../../models/Zone.model');

class ZoneRepository {
  async getAllActiveZones() {
    return Zone.find({}).lean();
  }
  async getWaystonesByOwner(uuid) {
    return mongoose.connection.db.collection('dens_waystones').find({ owner_id: uuid }).toArray();
  }

  async getAllPlacedWaystones() {
    return mongoose.connection.db
      .collection('dens_waystones')
      .find({ is_active: true, location: { $exists: true, $ne: '' } })
      .toArray();
  }

  async getPlayerFriendsMap(ownerUuids) {
    if (!ownerUuids.length) return new Map();
    const docs = await mongoose.connection.db
      .collection('players')
      .find({ _id: { $in: ownerUuids } }, { projection: { _id: 1, friends: 1 } })
      .toArray();
    return new Map(docs.map((p) => [p._id, Array.isArray(p.friends) ? p.friends : []]));
  }
}

module.exports = new ZoneRepository();
