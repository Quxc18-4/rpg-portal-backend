const mongoose = require('mongoose');
const { ObjectId } = mongoose.Types;

class TradeRepository {
  constructor() {
    this.resolvedCollectionName = null;
  }

  async getCollection() {
    const db = mongoose.connection.db;
    if (!this.resolvedCollectionName) {
      const collections = await db.listCollections().toArray();
      const names = new Set(collections.map((c) => c.name));
      const candidates = ['trade_logs', 'trades', 'trade_history'];
      this.resolvedCollectionName =
        candidates.find((name) => names.has(name)) || 'trade_logs';
    }
    return db.collection(this.resolvedCollectionName);
  }

  buildIdFilter(id) {
    const cleanId = String(id || '').trim();
    const orConditions = [{ trade_id: cleanId }, { tradeId: cleanId }, { _id: cleanId }];
    if (ObjectId.isValid(cleanId) && String(new ObjectId(cleanId)) === cleanId) {
      orConditions.push({ _id: new ObjectId(cleanId) });
    }
    return { $or: orConditions };
  }

  buildPlayerFilter(uuid) {
    return {
      $or: [{ player1: uuid }, { player2: uuid }],
    };
  }

  buildPairFilter(uuidA, uuidB) {
    return {
      $or: [
        { player1: uuidA, player2: uuidB },
        { player1: uuidB, player2: uuidA },
      ],
    };
  }

  resolveSort(sortBy = 'newest') {
    if (sortBy === 'oldest') {
      return { timestamp: 1, _id: 1 };
    }
    return { timestamp: -1, _id: -1 };
  }

  async findPaginated({ filter = {}, sort = { timestamp: -1, _id: -1 }, skip = 0, limit = 20 } = {}) {
    const col = await this.getCollection();
    const [docs, total] = await Promise.all([
      col.find(filter).sort(sort).skip(skip).limit(limit).toArray(),
      col.countDocuments(filter),
    ]);
    return { docs, total };
  }

  async findAllMatching({ filter = {}, sort = { timestamp: -1, _id: -1 }, maxScan = 500 } = {}) {
    const col = await this.getCollection();
    return col.find(filter).sort(sort).limit(maxScan).toArray();
  }

  async findById(id) {
    const col = await this.getCollection();
    return col.findOne(this.buildIdFilter(id));
  }
}

module.exports = new TradeRepository();