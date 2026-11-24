const waystoneRepo = require('./waystone.repository');
const { formatCurrency } = require('../../utils/currency.util');

class WaystoneService {
  parseLocation(locStr) {
    if (!locStr || typeof locStr !== 'string' || locStr.trim() === '') {
      return null;
    }
    const parts = locStr.split(',');
    if (parts.length < 4) return null;

    const world = parts[0];
    const x = Number(parts[1]);
    const y = Number(parts[2]);
    const z = Number(parts[3]);

    return {
      raw: locStr,
      world,
      x,
      y,
      z,
      layer: y < 50 ? 'UNDERGROUND' : 'SURFACE',
    };
  }

  formatWaystone(ws, accessLevel = 'PUBLIC') {
    const now = Date.now();
    const parsedCoords = this.parseLocation(ws.location);
    const isPlaced = parsedCoords !== null;
    const expiryTime = Number(ws.expiry_time || 0);
    const isExpired = expiryTime > 0 ? now > expiryTime : false;
    const isOperational = Boolean(ws.is_active) && isPlaced && !isExpired;

    // 1. Tầng PUBLIC: Chỉ trả thông tin danh bạ cơ bản & phí dịch chuyển (không lộ tọa độ, không lộ giờ hết thuế)
    const result = {
      id: String(ws._id),
      waystoneId: ws.waystone_id,
      ownerId: ws.owner_id,
      ownerName: ws.owner_name,
      customName: ws.custom_name,
      level: ws.level || 1,
      territoryLayer: 'WAYSTONE',
      territoryPriority: 3,
      isPlaced,
      isOperational,
      allowFriendTeleport: Boolean(ws.allow_friend_teleport),
      visitFee: formatCurrency(ws.visit_fee || 0),
      accessLevel,
    };

    // 2. Tầng FRIEND: Mở khóa tọa độ để hiển thị lên bản đồ 2.5D
    if (accessLevel === 'FRIEND' || accessLevel === 'OWNER') {
      result.coordinates = parsedCoords;
    }

    // 3. Tầng OWNER: Mở khóa toàn bộ thông số thuế, bảo vệ block & danh sách tin cậy
    if (accessLevel === 'OWNER') {
      result.isActive = Boolean(ws.is_active);
      result.isPreserved = Boolean(ws.is_preserved);
      result.preventMobSpawn = isOperational;
      result.taxStatus = {
        expiryTime,
        remainingMs: isExpired ? 0 : Math.max(0, expiryTime - now),
        isExpired,
      };
      result.blockProtection = {
        current: Boolean(ws.current_block_protection),
        pending: Boolean(ws.pending_block_protection),
      };
      result.trustedPlayers = ws.trusted_players || [];
      result.spawnedMerchantUuids = ws.spawned_merchant_uuids || [];
    }

    return result;
  }

  async getMyWaystones(uuid) {
    const docs = await waystoneRepo.findByOwnerUuid(uuid);
    const waystones = docs.map((ws) => this.formatWaystone(ws, 'OWNER'));

    return {
      total: waystones.length,
      placedCount: waystones.filter((w) => w.isPlaced).length,
      unplacedCount: waystones.filter((w) => !w.isPlaced).length,
      waystones,
    };
  }

  async getWorldWaystones(viewerUser = null) {
    const docs = await waystoneRepo.findAllPlaced();
    const ownerUuids = [...new Set(docs.map((d) => d.owner_id).filter(Boolean))];
    const friendsMap = await waystoneRepo.findOwnerFriendsMap(ownerUuids);

    return docs.map((ws) => {
      let accessLevel = 'PUBLIC';

      if (viewerUser?.uuid) {
        if (viewerUser.uuid === ws.owner_id) {
          accessLevel = 'OWNER';
        } else {
          const isTrusted =
            Array.isArray(ws.trusted_players) && ws.trusted_players.includes(viewerUser.uuid);
          const isAllowedFriend =
            Boolean(ws.allow_friend_teleport) &&
            (friendsMap.get(ws.owner_id) || []).includes(viewerUser.uuid);

          if (isTrusted || isAllowedFriend) {
            accessLevel = 'FRIEND';
          }
        }
      }

      return this.formatWaystone(ws, accessLevel);
    });
  }
}

module.exports = new WaystoneService();