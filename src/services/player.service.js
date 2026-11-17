const playerRepo = require('../repositories/player.repository');
const { formatCurrency } = require('../utils/currency.util');

class PlayerService {
  async getLeaderboard() {
    const players = await playerRepo.getTopLevel(10);
    return players.map((p) => ({
      uuid: p._id,
      username: p.username,
      class: p.class,
      level: p.level,
      exp: p.exp,
      currency: formatCurrency(p.balance),
    }));
  }

  async getPublicProfile(username) {
    const player = await playerRepo.findByUsername(username);
    if (!player) {
      const err = new Error('Player not found');
      err.statusCode = 404;
      throw err;
    }

    return {
      uuid: player._id,
      username: player.username,
      class: player.class,
      level: player.level,
      resource: player.resource,
      exp: player.exp,
      currency: formatCurrency(player.balance),
      attributes: player.attributes,
      elements: player.elements,
      skills_data: player.skills_data,
    };
  }
}

module.exports = new PlayerService();
