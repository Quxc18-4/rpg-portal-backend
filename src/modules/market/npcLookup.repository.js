const mongoose = require('mongoose');

class NpcLookupRepository {
  getCollection(name) {
    const db = mongoose.connection?.db;
    if (!db) {
      throw new Error('MongoDB connection is not ready');
    }
    return db.collection(name);
  }

  async getAllShopsAndNpcs() {
    const [shops, npcs] = await Promise.all([
      this.getCollection('shops').find({}).toArray(),
      this.getCollection('shop_npcs').find({}).toArray(),
    ]);
    return { shops, npcs };
  }

  async getWaystonesByIds(waystoneIds) {
    const cleanIds = [...new Set((waystoneIds || []).filter(Boolean))];
    if (cleanIds.length === 0) return new Map();

    const docs = await this.getCollection('waystones')
      .find({ waystone_id: { $in: cleanIds } })
      .toArray();

    const map = new Map();
    for (const doc of docs) {
      map.set(doc.waystone_id, doc);
    }
    return map;
  }

  async getPlayerVipRecord(uuid) {
    if (!uuid) return null;
    return this.getCollection('player_accounts').findOne(
      { $or: [{ uuid }, { _id: uuid }] },
      { projection: { uuid: 1, is_vip: 1, vip_tier: 1, vip_expires_at: 1 } }
    );
  }
}

module.exports = new NpcLookupRepository();