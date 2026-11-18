const mongoose = require('mongoose');
const WebConfig = require('../models/WebConfig.model');
const OperatorAction = require('../models/OperatorAction.model');
const WebAccount = require('../models/WebAccount.model');

const escapeRegex = (str) => String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const DEFAULT_MOD_POLICY = {
  _id: 'moderator_policy',
  allowedActions: [
    'WARN_PLAYER',
    'MUTE_PLAYER',
    'KICK_PLAYER',
    'EXTEND_WAYSTONE_TAX',
    'SEND_COMPENSATION',
  ],
  limits: {
    maxMuteMinutes: 1440,
    maxTaxExtendDays: 7,
    maxCompensateCoins: 4096,
  },
};

class OperatorRepository {
  async getModeratorPolicy() {
    const doc = await WebConfig.findById('moderator_policy').lean();
    if (!doc) {
      return WebConfig.findOneAndUpdate(
        { _id: 'moderator_policy' },
        { $setOnInsert: DEFAULT_MOD_POLICY },
        { upsert: true, new: true }
      ).lean();
    }
    return doc;
  }

  async updateModeratorPolicy({ allowedActions, limits, updatedBy }) {
    const updateFields = { updatedBy };
    if (Array.isArray(allowedActions)) updateFields.allowedActions = allowedActions;
    if (limits && typeof limits === 'object') {
      if (limits.maxMuteMinutes !== undefined) {
        updateFields['limits.maxMuteMinutes'] = Number(limits.maxMuteMinutes);
      }
      if (limits.maxTaxExtendDays !== undefined) {
        updateFields['limits.maxTaxExtendDays'] = Number(limits.maxTaxExtendDays);
      }
      if (limits.maxCompensateCoins !== undefined) {
        updateFields['limits.maxCompensateCoins'] = Number(limits.maxCompensateCoins);
      }
    }

    return WebConfig.findOneAndUpdate(
      { _id: 'moderator_policy' },
      { $set: updateFields },
      { upsert: true, new: true }
    ).lean();
  }

  async enqueueAction(data) {
    const action = await OperatorAction.create(data);
    return action.toObject();
  }

  async findActions(filter = {}, limit = 50) {
    return OperatorAction.find(filter)
      .sort({ createdAt: -1 })
      .limit(Math.min(Number(limit) || 50, 200))
      .lean();
  }

  async findStaffAccounts() {
    return WebAccount.find({ role: { $in: ['MODERATOR', 'ADMIN'] } })
      .sort({ role: 1, username: 1 })
      .lean();
  }

  async findWebAccountByUuid(uuid) {
    return WebAccount.findOne({ uuid }).lean();
  }

  // ======================== VIEW ALL QUERIES (ADMIN / MOD) ========================

  async findAllPlayersPaginated({ search = '', sortBy = 'level', order = 'desc', page = 1, limit = 20 }) {
    const safePage = Math.max(1, Number(page) || 1);
    const safeLimit = Math.min(100, Math.max(1, Number(limit) || 20));
    const skip = (safePage - 1) * safeLimit;

    const filter = {};
    if (search && search.trim() !== '') {
      const regex = new RegExp(escapeRegex(search.trim()), 'i');
      filter.$or = [{ username: regex }, { _id: regex }];
    }

    const allowedSortFields = {
      level: 'level',
      coins: 'coins',
      username: 'username',
      lastLogin: 'lastLogin',
    };
    const sortField = allowedSortFields[sortBy] || 'level';
    const sortDir = String(order).toLowerCase() === 'asc' ? 1 : -1;

    const playersCol = mongoose.connection.db.collection('players');
    const [players, total] = await Promise.all([
      playersCol
        .find(filter, {
          projection: {
            _id: 1,
            username: 1,
            level: 1,
            exp: 1,
            coins: 1,
            classId: 1,
            playerClass: 1,
            lastLogin: 1,
          },
        })
        .sort({ [sortField]: sortDir, username: 1 })
        .skip(skip)
        .limit(safeLimit)
        .toArray(),
      playersCol.countDocuments(filter),
    ]);

    const uuids = players.map((p) => p._id);
    const webAccounts = await WebAccount.find({ uuid: { $in: uuids } }).lean();
    const webMap = new Map(webAccounts.map((w) => [w.uuid, w]));

    return {
      items: players.map((p) => {
        const web = webMap.get(p._id);
        return {
          uuid: p._id,
          username: p.username,
          level: p.level || 1,
          classId: p.classId || p.playerClass || null,
          rawCoins: p.coins || 0,
          role: web?.role || 'USER',
          hasWebAccount: Boolean(web),
          discordUsername: web?.discord_username || null,
          lastLogin: p.lastLogin || null,
        };
      }),
      pagination: {
        page: safePage,
        limit: safeLimit,
        total,
        totalPages: Math.ceil(total / safeLimit),
      },
    };
  }

  async findAllWaystonesUnfiltered() {
    return mongoose.connection.db
      .collection('dens_waystones')
      .find({})
      .sort({ owner_name: 1 })
      .toArray();
  }

  async findAllPlayerUsernamesForScan(limit = 200) {
    return mongoose.connection.db
      .collection('players')
      .find({ username: { $exists: true, $ne: '' } }, { projection: { _id: 1, username: 1 } })
      .limit(limit)
      .toArray();
  }
}

module.exports = new OperatorRepository();