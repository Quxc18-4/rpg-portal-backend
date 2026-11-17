const PlayerAccount = require('../models/PlayerAccount.model');
const WebAccount = require('../models/WebAccount.model');

class AuthRepository {
  async findInGameAccountByUsername(username) {
    return PlayerAccount.findOne({ playerName: new RegExp(`^${username}$`, 'i') }).lean();
  }

  async findWebAccountByDiscordId(discordId) {
    return WebAccount.findOne({ discord_id: discordId }).lean();
  }

  async linkDiscordToUuid({ uuid, username, discordId, discordUsername, discordAvatar }) {
    return WebAccount.findOneAndUpdate(
      { uuid },
      {
        uuid,
        username,
        discord_id: discordId,
        discord_username: discordUsername,
        discord_avatar: discordAvatar,
      },
      { upsert: true, new: true }
    ).lean();
  }
}

module.exports = new AuthRepository();