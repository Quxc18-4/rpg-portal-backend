const Player = require('../../models/Player.model');

class PlayerRepository {
  async findByUsername(username) {
    return Player.findOne({ username: new RegExp(`^${username}$`, 'i') }).lean();
  }

  async getTopLevel(limit = 10) {
    return Player.find({}, 'username class level exp balance')
      .sort({ level: -1, exp: -1 })
      .limit(limit)
      .lean();
  }
}

module.exports = new PlayerRepository();
