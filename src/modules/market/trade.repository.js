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

  parseDateBoundary(rawVal, isEndOfDay = false) {
    if (rawVal === undefined || rawVal === null || String(rawVal).trim() === '') {
      return null;
    }
    const str = String(rawVal).trim();

    if (/^\d+$/.test(str)) {
      const num = Number(str);
      if (!Number.isFinite(num) || num <= 0) return null;
      return num < 1e12 ? num * 1000 : num;
    }

    if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
      const suffix = isEndOfDay ? 'T23:59:59.999Z' : 'T00:00:00.000Z';
      const ms = Date.parse(`${str}${suffix}`);
      return Number.isNaN(ms) ? null : ms;
    }

    const ms = Date.parse(str);
    return Number.isNaN(ms) ? null : ms;
  }

  buildDateFilter({ date, from, to, startDate, endDate } = {}) {
    const range = {};

    if (date && String(date).trim() !== '') {
      const startMs = this.parseDateBoundary(date, false);
      const endMs = this.parseDateBoundary(date, true);
      if (startMs !== null) range.$gte = startMs;
      if (endMs !== null) range.$lte = endMs;
    } else {
      const rawFrom = from !== undefined ? from : startDate;
      const rawTo = to !== undefined ? to : endDate;

      const startMs = this.parseDateBoundary(rawFrom, false);
      const endMs = this.parseDateBoundary(rawTo, true);

      if (startMs !== null) range.$gte = startMs;
      if (endMs !== null) range.$lte = endMs;
    }

    if (Object.keys(range).length === 0) return null;
    return { timestamp: range };
  }

  resolveSort(sortBy = 'newest') {
    const normalized = String(sortBy || 'newest').trim().toLowerCase();
    if (normalized === 'oldest' || normalized === 'date_asc' || normalized === 'asc') {
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