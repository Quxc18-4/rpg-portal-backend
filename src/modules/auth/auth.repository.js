const PlayerAccount = require('../../models/PlayerAccount.model');
const WebAccount = require('../../models/WebAccount.model');

const getSuperAdminList = () =>
  (process.env.SUPER_ADMINS || '')
    .split(',')
    .map((name) => name.trim().toLowerCase())
    .filter(Boolean);

class AuthRepository {
  async findInGameAccountByUsername(username) {
    return PlayerAccount.findOne({
      playerName: { $regex: new RegExp(`^${username}$`, 'i') },
    }).lean();
  }

  async findWebAccountByDiscordId(discordId) {
    return WebAccount.findOne({ discord_id: discordId }).lean();
  }

  async linkDiscordToUuid({ uuid, username, discordId, discordUsername, discordAvatar }) {
    return WebAccount.findOneAndUpdate(
      { uuid },
      {
        $set: {
          username,
          discord_id: discordId,
          discord_username: discordUsername,
          discord_avatar: discordAvatar,
        },
        $setOnInsert: { uuid, role: 'USER' },
      },
      { upsert: true, new: true }
    ).lean();
  }

  async findOrCreateWebAccount(uuid, username) {
    const isSuper = getSuperAdminList().includes(String(username).toLowerCase());

    const updateQuery = isSuper
      ? { $set: { username, role: 'ADMIN' }, $setOnInsert: { uuid } }
      : { $set: { username }, $setOnInsert: { uuid, role: 'USER' } };

    return WebAccount.findOneAndUpdate({ uuid }, updateQuery, {
      upsert: true,
      new: true,
    }).lean();
  }

  async updateRoleByUuid(uuid, role) {
    return WebAccount.findOneAndUpdate({ uuid }, { $set: { role } }, { new: true }).lean();
  }

  // Gọi 1 lần sau khi MongoDB kết nối thành công để đồng bộ sẵn quyền ADMIN cho SUPER_ADMINS
  async seedSuperAdmins() {
    const superAdmins = getSuperAdminList();
    if (superAdmins.length === 0) return;

    for (const name of superAdmins) {
      const inGameAcc = await this.findInGameAccountByUsername(name);
      if (inGameAcc) {
        await this.findOrCreateWebAccount(inGameAcc._id, inGameAcc.playerName);
        console.log(`[RBAC] Đã đồng bộ quyền ADMIN cho tài khoản: ${inGameAcc.playerName}`);
      }
    }
  }
}

module.exports = new AuthRepository();