const zoneRepo = require('./zone.repository');
const { formatCurrency } = require('../../utils/currency.util');

class ZoneService {
  async getWorldZones() {
    const zones = await zoneRepo.getAllActiveZones();
    return zones.map((z) => ({
      id: z._id,
      configId: z.zone_config_id,
      familyId: z.family_id,
      layer: z.center_location?.y < 50 ? 'UNDERGROUND' : 'SURFACE',
      location: z.center_location,
      radius: z.radius,
      level: z.level,
      state: z.state,
      growthStage: z.growth_stage,
      progress: {
        killed: z.mobs_killed,
        objective: z.kill_objective,
      },
      deadUntil: z.dead_until,
    }));
  }
  parseWaystoneLocation(locStr) {
    if (!locStr || typeof locStr !== 'string' || locStr.trim() === '') return null;
    const parts = locStr.split(',');
    if (parts.length < 4) return null;
    const y = Number(parts[2]);
    return {
      raw: locStr,
      world: parts[0],
      x: Number(parts[1]),
      y,
      z: Number(parts[3]),
      layer: y < 50 ? 'UNDERGROUND' : 'SURFACE',
    };
  }

  formatWaystone(ws, accessLevel = 'OWNER') {
    const parsedCoords = this.parseWaystoneLocation(ws.location);
    const expiryTime = Number(ws.expiry_time || 0);
    const result = {
      id: String(ws._id),
      waystoneId: ws.waystone_id,
      ownerId: ws.owner_id,
      ownerName: ws.owner_name,
      customName: ws.custom_name,
      level: ws.level || 1,
      isPlaced: parsedCoords !== null,
      isActive: Boolean(ws.is_active),
      isPreserved: Boolean(ws.is_preserved),
      allowFriendTeleport: Boolean(ws.allow_friend_teleport),
      visitFee: formatCurrency(ws.visit_fee || 0),
      coordinates: parsedCoords,
      expiryTime,
      isExpired: expiryTime > 0 ? Date.now() > expiryTime : false,
      accessLevel,
    };

    if (accessLevel === 'OWNER') {
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
    const docs = await zoneRepo.getWaystonesByOwner(uuid);
    const waystones = docs.map((ws) => this.formatWaystone(ws, 'OWNER'));
    return {
      total: waystones.length,
      placedCount: waystones.filter((w) => w.isPlaced).length,
      unplacedCount: waystones.filter((w) => !w.isPlaced).length,
      waystones,
    };
  }

  async getWorldWaystones(viewerUser = null) {
    const docs = await zoneRepo.getAllPlacedWaystones();
    const ownerUuids = [...new Set(docs.map((d) => d.owner_id).filter(Boolean))];
    const friendsMap = await zoneRepo.getPlayerFriendsMap(ownerUuids);

    return docs.map((ws) => {
      let accessLevel = 'PUBLIC';
      if (viewerUser?.uuid) {
        if (viewerUser.uuid === ws.owner_id) {
          accessLevel = 'OWNER';
        } else {
          const isTrusted = Array.isArray(ws.trusted_players) && ws.trusted_players.includes(viewerUser.uuid);
          const isAllowedFriend =
            Boolean(ws.allow_friend_teleport) && (friendsMap.get(ws.owner_id) || []).includes(viewerUser.uuid);
          if (isTrusted || isAllowedFriend) accessLevel = 'FRIEND';
        }
      }
      return this.formatWaystone(ws, accessLevel);
    });
  }
}

module.exports = new ZoneService();
