const mongoose = require('mongoose');

class GuildRepository {
  getCollection() {
    return mongoose.connection.db.collection('guilds');
  }

  escapeRegex(value) {
    return String(value || '')
      .trim()
      .replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  async findByIdOrName(guildId, projection = undefined) {
    const cleanId = String(guildId || '').trim().toLowerCase();
    if (!cleanId) return null;

    const options = projection ? { projection } : undefined;
    return this.getCollection().findOne(
      {
        $or: [
          { _id: cleanId },
          { name: new RegExp(`^${this.escapeRegex(cleanId)}$`, 'i') },
        ],
      },
      options
    );
  }

  async findByMemberUuid(uuid, projection = undefined) {
    if (!uuid) return null;

    const options = projection ? { projection } : undefined;
    return this.getCollection().findOne(
      {
        $or: [{ leader: uuid }, { 'vice-leaders': uuid }, { members: uuid }],
      },
      options
    );
  }

  async findPaginatedLeaderboard({ q = '', sortBy = 'level', skip = 0, limit = 20 } = {}) {
    const filter = {};
    if (q && String(q).trim() !== '') {
      const regex = new RegExp(this.escapeRegex(q), 'i');
      filter.$or = [{ name: regex }, { _id: regex }];
    }

    const sortStage =
      sortBy === 'members'
        ? { memberCount: -1, level: -1, exp: -1 }
        : { level: -1, exp: -1, memberCount: -1 };

    const pipeline = [
      { $match: filter },
      {
        $addFields: {
          memberCount: { $size: { $ifNull: ['$members', []] } },
        },
      },
      { $sort: sortStage },
      { $skip: skip },
      { $limit: limit },
      {
        $project: {
          vaults: 0,
          'bank-balance': 0,
        },
      },
    ];

    const [docs, total] = await Promise.all([
      this.getCollection().aggregate(pipeline).toArray(),
      this.getCollection().countDocuments(filter),
    ]);

    return { docs, total };
  }

  async findPaginatedAdmin({ q = '', skip = 0, limit = 10 } = {}) {
    const filter = {};
    if (q && String(q).trim() !== '') {
      const regex = new RegExp(this.escapeRegex(q), 'i');
      filter.$or = [{ name: regex }, { _id: regex }];
    }

    const [docs, total] = await Promise.all([
      this.getCollection()
        .find(filter)
        .sort({ level: -1, exp: -1 })
        .skip(skip)
        .limit(limit)
        .toArray(),
      this.getCollection().countDocuments(filter),
    ]);

    return { docs, total };
  }
}

module.exports = new GuildRepository();