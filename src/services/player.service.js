const playerRepo = require('../repositories/player.repository');
const { formatCurrency } = require('../utils/currency.util');

class PlayerService {
  resolveAccessLevel(targetPlayer, viewerUser) {
    if (!viewerUser || !viewerUser.uuid) return 'PUBLIC';
    if (viewerUser.uuid === targetPlayer._id) return 'OWNER';

    const friendList = Array.isArray(targetPlayer.friends) ? targetPlayer.friends : [];
    if (friendList.includes(viewerUser.uuid)) return 'FRIEND';

    return 'PUBLIC';
  }

  async getLeaderboard() {
    const players = await playerRepo.getTopLevel(10);
    // Bảng xếp hạng công khai chỉ hiển thị cấp độ, không lộ số dư chi tiết
    return players.map((p) => ({
      uuid: p._id,
      username: p.username,
      class: p.class,
      level: p.level,
      exp: p.exp,
    }));
  }

  async getProfile(username, viewerUser = null) {
    const player = await playerRepo.findByUsername(username);
    if (!player) {
      const err = new Error('Không tìm thấy người chơi');
      err.statusCode = 404;
      throw err;
    }

    const accessLevel = this.resolveAccessLevel(player, viewerUser);

    // 1. Dữ liệu Public tối thiểu (Ai cũng xem được)
    const profile = {
      accessLevel,
      uuid: player._id,
      username: player.username,
      class: player.class,
      level: player.level,
    };

    // 2. Mở khóa cho Bạn bè hoặc Chính chủ
    if (accessLevel === 'FRIEND' || accessLevel === 'OWNER') {
      profile.resource = player.resource;
      profile.exp = player.exp;
      profile.elements = player.elements;
      profile.attributes = player.attributes;
      profile.skills_data = player.skills_data;
    }

    // 3. Mở khóa độc quyền cho Chính chủ (Bearer JWT khớp UUID)
    if (accessLevel === 'OWNER') {
      profile.currency = formatCurrency(player.balance);
    }

    return profile;
  }

  async getMyProfile(viewerUser) {
    return this.getProfile(viewerUser.username, viewerUser);
  }
}

module.exports = new PlayerService();