const Player = require('../../models/Player.model');

class PlayerRepository {
  async findByUsername(username) {
    return Player.findOne({ username: new RegExp(`^${username}$`, 'i') }).lean();
  }

  async findByUuid(uuid) {
    return Player.findById(uuid).lean();
  }

  async getTopLevel(limit = 10) {
    return Player.aggregate([
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
        $project: {
          _id: 1,
          username: 1,
          activeSlot: { $ifNull: ['$active_slot', 1] },
          class: { $ifNull: ['$_matchedSlot.v.class', { $ifNull: ['$class', 'commoner'] }] },
          level: { $ifNull: ['$_matchedSlot.v.level', { $ifNull: ['$level', 1] }] },
          exp: { $ifNull: ['$_matchedSlot.v.exp', { $ifNull: ['$exp', 0] }] },
        },
      },
      { $sort: { level: -1, exp: -1, username: 1 } },
      { $limit: limit },
    ]);
  }
}

module.exports = new PlayerRepository();