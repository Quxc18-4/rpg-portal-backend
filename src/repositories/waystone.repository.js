const mongoose = require('mongoose');

class WaystoneRepository {
  async findByOwnerUuid(uuid) {
    return mongoose.connection.db
      .collection('dens_waystones')
      .find({ owner_id: uuid })
      .toArray();
  }

  async findAllPlaced() {
    return mongoose.connection.db
      .collection('dens_waystones')
      .find({
        is_active: true,
        location: { $exists: true, $ne: '' },
      })
      .toArray();
  }

  async findOwnerFriendsMap(ownerUuids) {
    if (!ownerUuids || ownerUuids.length === 0) return new Map();
    const players = await mongoose.connection.db
      .collection('players')
      .find({ _id: { $in: ownerUuids } }, { projection: { _id: 1, friends: 1 } })
      .toArray();

    return new Map(players.map((p) => [p._id, Array.isArray(p.friends) ? p.friends : []]));
  }
}

module.exports = new WaystoneRepository();