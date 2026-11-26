const mongoose = require('mongoose');
const WebConfig = require('../../models/WebConfig.model');
const OperatorAction = require('../../models/OperatorAction.model');
const WebAccount = require('../../models/WebAccount.model');

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

  async resolveCollectionName(candidates) {
    const cols = await mongoose.connection.db.listCollections().toArray();
    const existingNames = new Set(cols.map((c) => c.name));
    for (const name of candidates) {
      if (existingNames.has(name)) return name;
    }
    return candidates[0];
  }

  async buildUsernameMap(uuids) {
    if (!Array.isArray(uuids) || uuids.length === 0) return new Map();

    const [players, accounts] = await Promise.all([
      mongoose.connection.db
        .collection('players')
        .find({ _id: { $in: uuids } }, { projection: { _id: 1, username: 1 } })
        .toArray(),
      mongoose.connection.db
        .collection('player_accounts')
        .find({ _id: { $in: uuids } }, { projection: { _id: 1, playerName: 1 } })
        .toArray(),
    ]);

    const map = new Map();
    for (const acc of accounts) {
      if (acc.playerName) map.set(acc._id, acc.playerName);
    }
    for (const p of players) {
      if (p.username) map.set(p._id, p.username);
    }
    return map;
  }

  // ======================== VIEW ALL QUERIES (ADMIN / MOD) ========================

  async findAllPlayersPaginated({ search = '', sortBy = 'level', order = 'desc', page = 1, limit = 20 }) {
    const safePage = Math.max(1, Number(page) || 1);
    const safeLimit = Math.min(100, Math.max(1, Number(limit) || 20));
    const skip = (safePage - 1) * safeLimit;

    const matchStage = {};
    if (search && search.trim() !== '') {
      const regex = new RegExp(escapeRegex(search.trim()), 'i');
      matchStage.$or = [{ username: regex }, { _id: regex }];
    }

    const allowedSortFields = {
      level: 'resolvedLevel',
      coins: 'resolvedBalance',
      balance: 'resolvedBalance',
      username: 'username',
      lastLogin: 'lastLogin',
    };
    const sortField = allowedSortFields[sortBy] || 'resolvedLevel';
    const sortDir = String(order).toLowerCase() === 'asc' ? 1 : -1;

    const playersCol = mongoose.connection.db.collection('players');

    const pipeline = [
      { $match: matchStage },
      {
        $addFields: {
          _activeSlotKey: { $toString: { $ifNull: ['$active_slot', 1] } },
          _slotsArray: { $objectToArray: { $ifNull: ['$slots', {}] } },
        },
      },
      {
        $addFields: {
          _matchedSlot: {
            $first: {
              $filter: {
                input: '$_slotsArray',
                as: 'item',
                cond: { $eq: ['$$item.k', '$_activeSlotKey'] },
              },
            },
          },
        },
      },
      {
        $addFields: {
          resolvedActiveSlot: { $ifNull: ['$active_slot', 1] },
          resolvedLevel: { $ifNull: ['$_matchedSlot.v.level', { $ifNull: ['$level', 1] }] },
          resolvedBalance: {
            $ifNull: ['$_matchedSlot.v.balance', { $ifNull: ['$balance', { $ifNull: ['$coins', 0] }] }],
          },
          resolvedClassId: {
            $ifNull: ['$_matchedSlot.v.class', { $ifNull: ['$class', { $ifNull: ['$classId', 'commoner'] }] }],
          },
        },
      },
      { $sort: { [sortField]: sortDir, username: 1 } },
      { $skip: skip },
      { $limit: safeLimit },
    ];

    const [players, total] = await Promise.all([
      playersCol.aggregate(pipeline).toArray(),
      playersCol.countDocuments(matchStage),
    ]);

    const uuids = players.map((p) => p._id);
    const [webAccounts, gameAccounts] = await Promise.all([
      WebAccount.find({ uuid: { $in: uuids } }).lean(),
      mongoose.connection.db
        .collection('player_accounts')
        .find(
          { _id: { $in: uuids } },
          { projection: { _id: 1, is_vip: 1, vip_expires_at: 1, max_slots: 1 } }
        )
        .toArray(),
    ]);

    const webMap = new Map(webAccounts.map((w) => [w.uuid, w]));
    const accMap = new Map(gameAccounts.map((a) => [a._id, a]));
    const now = Date.now();

    return {
      items: players.map((p) => {
        const web = webMap.get(p._id);
        const acc = accMap.get(p._id);
        const expiresAt = Number(acc?.vip_expires_at || 0);
        const isVip = Boolean(acc?.is_vip) && (expiresAt === 0 || expiresAt > now);

        return {
          uuid: p._id,
          username: p.username,
          activeSlot: p.resolvedActiveSlot,
          maxSlots: Number(acc?.max_slots || 2),
          isVip,
          level: p.resolvedLevel,
          classId: p.resolvedClassId,
          rawCoins: p.resolvedBalance,
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

  async findAllMountOwnerUuids() {
    const docs = await mongoose.connection.db
      .collection('player_mounts')
      .find({}, { projection: { _id: 1 } })
      .toArray();
    return docs.map((d) => d._id);
  }

  async findAllJobOwnerUuids() {
    const docs = await mongoose.connection.db
      .collection('player_jobs')
      .find({}, { projection: { _id: 1 } })
      .toArray();
    return docs.map((d) => d._id);
  }

  async findAllPlayerUsernamesForScan(limit = 200) {
    return mongoose.connection.db
      .collection('players')
      .find(
        { username: { $exists: true, $ne: '' } },
        { projection: { _id: 1, username: 1, active_slot: 1, slots: 1 } }
      )
      .limit(limit)
      .toArray();
  }
  async getEconomyOverviewMetrics() {
    const db = mongoose.connection.db;
    const cols = await db.listCollections().toArray();
    const existingNames = new Set(cols.map((c) => c.name));
    const tradeColName = await this.resolveCollectionName([
      'trade_logs',
      'trades',
      'trade_history',
    ]);
    const now = Date.now();

    const [
      playerStatsAgg,
      vipCount,
      totalGuilds,
      guildBankAgg,
      activeAuctionsCount,
      activeAuctionAgg,
      soldAuctionsCount,
      soldAuctionAgg,
      totalTradesCount,
    ] = await Promise.all([
      db
        .collection('players')
        .aggregate([
          {
            $project: {
              slotsArr: { $objectToArray: { $ifNull: ['$slots', {}] } },
              rootBalance: { $ifNull: ['$balance', { $ifNull: ['$coins', 0] }] },
            },
          },
          {
            $project: {
              playerCoins: {
                $cond: [
                  { $gt: [{ $size: '$slotsArr' }, 0] },
                  {
                    $reduce: {
                      input: '$slotsArr',
                      initialValue: 0,
                      in: {
                        $add: ['$$value', { $ifNull: ['$$this.v.balance', 0] }],
                      },
                    },
                  },
                  '$rootBalance',
                ],
              },
            },
          },
          {
            $group: {
              _id: null,
              totalPlayers: { $sum: 1 },
              totalCoins: { $sum: '$playerCoins' },
            },
          },
        ])
        .toArray(),
      existingNames.has('player_accounts')
        ? db.collection('player_accounts').countDocuments({
            is_vip: true,
            $or: [
              { vip_expires_at: { $exists: false } },
              { vip_expires_at: null },
              { vip_expires_at: 0 },
              { vip_expires_at: { $gt: now } },
            ],
          })
        : 0,
      existingNames.has('guilds') ? db.collection('guilds').countDocuments({}) : 0,
      existingNames.has('guilds')
        ? db
            .collection('guilds')
            .aggregate([
              {
                $group: {
                  _id: null,
                  total: { $sum: { $ifNull: ['$bank-balance', 0] } },
                },
              },
            ])
            .toArray()
        : [],
      existingNames.has('auction_active')
        ? db.collection('auction_active').countDocuments({})
        : 0,
      existingNames.has('auction_active')
        ? db
            .collection('auction_active')
            .aggregate([
              {
                $group: {
                  _id: null,
                  total: { $sum: { $ifNull: ['$price', 0] } },
                },
              },
            ])
            .toArray()
        : [],
      existingNames.has('auction_history')
        ? db.collection('auction_history').countDocuments({ status: /^SOLD$/i })
        : 0,
      existingNames.has('auction_history')
        ? db
            .collection('auction_history')
            .aggregate([
              { $match: { status: /^SOLD$/i } },
              {
                $group: {
                  _id: null,
                  total: { $sum: { $ifNull: ['$price', 0] } },
                },
              },
            ])
            .toArray()
        : [],
      existingNames.has(tradeColName)
        ? db.collection(tradeColName).countDocuments({})
        : 0,
    ]);

    return {
      totalPlayers: playerStatsAgg[0]?.totalPlayers || 0,
      vipCount,
      playerCirculationRaw: playerStatsAgg[0]?.totalCoins || 0,
      totalGuilds,
      guildBankTotalRaw: guildBankAgg[0]?.total || 0,
      activeAuctionsCount,
      activeAuctionListedRaw: activeAuctionAgg[0]?.total || 0,
      soldAuctionsCount,
      soldAuctionVolumeRaw: soldAuctionAgg[0]?.total || 0,
      totalTradesCount,
    };
  }
}

module.exports = new OperatorRepository();