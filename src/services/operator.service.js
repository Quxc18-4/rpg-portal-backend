const operatorRepo = require('../repositories/operator.repository');
const playerRepo = require('../repositories/player.repository');
const authRepo = require('../repositories/auth.repository');
const playerService = require('./player.service');
const jobService = require('./job.service');
const mountService = require('./mount.service');
const cropService = require('./crop.service');
const waystoneService = require('./waystone.service');
const { formatCurrency } = require('../utils/currency.util');
const { AppError } = require('../utils/error.util');

const VALID_ROLES = ['GUEST', 'USER', 'MODERATOR', 'ADMIN'];

class OperatorService {
  async resolveTargetPlayer(username) {
    const target = await playerRepo.findByUsername(username);
    if (!target) {
      throw AppError.notFound('PLAYER_NOT_FOUND');
    }
    return target;
  }

  // ======================== 1. QUYỀN ĐỌC CHI TIẾT (INSPECT) ========================

  async inspectPlayerOverview(username, options = {}) {
    const target = await this.resolveTargetPlayer(username);
    const ownerViewer = { uuid: target._id, username: target.username };

    const [profile, inventory, jobs, mounts, crops, waystones] = await Promise.all([
      playerService.getProfile(target.username, ownerViewer),
      playerService.getMyInventory(ownerViewer, options),
      jobService.getMyJobs(target._id),
      mountService.getMyMounts(target._id, options),
      cropService.getMyCrops(target._id),
      waystoneService.getMyWaystones(target._id),
    ]);

    return { profile, inventory, jobs, mounts, crops, waystones };
  }

  async inspectPlayerInventory(username, options = {}) {
    const target = await this.resolveTargetPlayer(username);
    return playerService.getMyInventory({ uuid: target._id, username: target.username }, options);
  }

  async inspectPlayerJobs(username) {
    const target = await this.resolveTargetPlayer(username);
    return jobService.getMyJobs(target._id);
  }

  async inspectPlayerMounts(username, options = {}) {
    const target = await this.resolveTargetPlayer(username);
    return mountService.getMyMounts(target._id, options);
  }

  async inspectPlayerCrops(username) {
    const target = await this.resolveTargetPlayer(username);
    return cropService.getMyCrops(target._id);
  }

  async inspectPlayerWaystones(username) {
    const target = await this.resolveTargetPlayer(username);
    return waystoneService.getMyWaystones(target._id);
  }

  extractSearchableText(value, depth = 0) {
    if (value == null || depth > 5) return '';
    if (typeof value === 'string') {
      if (value.length > 500 && !value.includes(' ')) return '';
      return value;
    }
    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }
    if (Array.isArray(value)) {
      return value.map((v) => this.extractSearchableText(v, depth + 1)).join(' ');
    }
    if (typeof value === 'object') {
      return Object.entries(value)
        .filter(([k]) => k !== 'raw' && k !== 'inventoryBase64' && k !== 'nbt')
        .map(([, v]) => this.extractSearchableText(v, depth + 1))
        .join(' ');
    }
    return '';
  }

  matchItemKeyword(item, normalizedKeyword) {
    if (!item || typeof item !== 'object') return false;
    const haystack = this.extractSearchableText(item).toLowerCase().normalize('NFC');
    return haystack.includes(normalizedKeyword);
  }

  async searchPlayerMountStorage(uuid, normalizedKeyword, options = {}) {
    const mountData = await mountService.getMyMounts(uuid, options);

    const mountsList = Array.isArray(mountData)
      ? mountData
      : Array.isArray(mountData?.mounts)
        ? mountData.mounts
        : mountData?.mounts && typeof mountData.mounts === 'object'
          ? Object.entries(mountData.mounts).map(([slot, m]) => ({ slot, ...m }))
          : [];

    const matchedMountItems = [];

    for (const mount of mountsList) {
      if (!mount || typeof mount !== 'object') continue;

      const slotId = mount.slot ?? mount.slotId ?? mount.index ?? '?';
      const mountLabel = mount.customName || mount.type || `Mount #${slotId}`;

      const storageCandidates = [
        mount.saddleStorage?.items,
        mount.saddleStorage,
        mount.storage?.items,
        mount.storage?.contents,
        mount.storage?.slots,
        mount.storage,
        mount.inventory?.items,
        mount.inventory?.contents,
        mount.inventory?.slots,
        mount.inventory,
        mount.bag?.items,
        mount.bag,
        mount.items,
      ];

      let rawItems = [];
      for (const candidate of storageCandidates) {
        if (Array.isArray(candidate) && candidate.length > 0) {
          rawItems = candidate;
          break;
        }
        if (candidate && typeof candidate === 'object' && !Array.isArray(candidate)) {
          const objectValues = Object.values(candidate).filter((v) => v && typeof v === 'object');
          if (objectValues.length > 0) {
            rawItems = objectValues;
            break;
          }
        }
      }

      for (const item of rawItems) {
        if (this.matchItemKeyword(item, normalizedKeyword)) {
          matchedMountItems.push({
            ...item,
            source: `MOUNT_${slotId}`,
            mountSlot: String(slotId),
            mountName: mountLabel,
          });
        }
      }
    }

    return matchedMountItems;
  }

  async searchPlayerInventory(username, keyword, options = {}) {
    if (!keyword || String(keyword).trim() === '') {
      throw AppError.badRequest('VALIDATION_ERROR');
    }

    const target = await this.resolveTargetPlayer(username);
    const normalizedKeyword = String(keyword).trim().toLowerCase().normalize('NFC');

    const [baseFound, mountItems] = await Promise.all([
      playerService.searchMyInventory(
        { uuid: target._id, username: target.username },
        String(keyword).trim().normalize('NFC'),
        options
      ),
      this.searchPlayerMountStorage(target._id, normalizedKeyword, options),
    ]);

    const baseItems = Array.isArray(baseFound)
      ? baseFound
      : baseFound?.items || baseFound?.matches || baseFound?.results || [];

    const combinedItems = [...baseItems, ...mountItems];
    const totalQuantity = combinedItems.reduce(
      (sum, item) => sum + (Number(item.amount || item.count) || 1),
      0
    );

    return {
      uuid: target._id,
      username: target.username,
      keyword: String(keyword).trim().normalize('NFC'),
      totalMatched: combinedItems.length,
      totalQuantity,
      items: combinedItems,
    };
  }

  // ======================== 2. VIEW ALL TOÀN SERVER ========================

  async getAllPlayersOverview(query = {}) {
    const result = await operatorRepo.findAllPlayersPaginated(query);
    return {
      items: result.items.map((item) => ({
        ...item,
        balance: formatCurrency(item.rawCoins),
      })),
      pagination: result.pagination,
    };
  }

  async getAllWaystonesAdmin() {
    const docs = await operatorRepo.findAllWaystonesUnfiltered();
    const formatted = docs.map((ws) => waystoneService.formatWaystone(ws, 'OWNER'));

    return {
      total: formatted.length,
      placedCount: formatted.filter((w) => w.isPlaced).length,
      unplacedCount: formatted.filter((w) => !w.isPlaced).length,
      expiredCount: formatted.filter((w) => w.taxStatus?.isExpired).length,
      waystones: formatted,
    };
  }

  async getAllMountsAdmin(options = {}) {
    const uuids = await operatorRepo.findAllMountOwnerUuids();
    const usernameMap = await operatorRepo.buildUsernameMap(uuids);

    const records = await Promise.all(
      uuids.map(async (uuid) => {
        const data = await mountService.getMyMounts(uuid, options);
        return {
          uuid,
          username: usernameMap.get(uuid) || 'Unknown',
          ...data,
        };
      })
    );

    return {
      totalOwners: records.length,
      records,
    };
  }

  formatCropLocations(locations = {}) {
    if (!locations || typeof locations !== 'object') {
      return { totalPlots: 0, readyCount: 0, plots: [] };
    }

    const now = Date.now();
    const plots = Object.entries(locations).map(([locKey, info]) => {
      const [world, x, y, z] = String(locKey).split(',');
      const plantTime = Number(info?.plantTime || 0);
      const reqTime = Number(info?.reqTime || 0);
      const readyAt = plantTime + reqTime;
      const isReady = now >= readyAt;
      const remainingMs = Math.max(0, readyAt - now);
      const progressPercent =
        reqTime > 0 ? Math.min(100, Math.max(0, Math.round(((now - plantTime) / reqTime) * 100))) : 100;

      return {
        locationKey: locKey,
        coordinates: {
          world: world || 'world',
          x: Number(x),
          y: Number(y),
          z: Number(z),
        },
        seedId: info?.seedId || null,
        harvestsLeft: Number(info?.harvestsLeft ?? 0),
        maxHarvests: Number(info?.maxHarvests ?? 1),
        plantTime,
        reqTime,
        readyAt,
        isReady,
        remainingMs,
        progressPercent,
      };
    });

    return {
      totalPlots: plots.length,
      readyCount: plots.filter((p) => p.isReady).length,
      plots,
    };
  }

  async getAllCropsAdmin() {
    const docs = await operatorRepo.findAllCropDocs();
    const uuids = docs.map((d) => d._id);
    const usernameMap = await operatorRepo.buildUsernameMap(uuids);

    const records = docs.map((doc) => {
      const formatted = this.formatCropLocations(doc.locations);
      return {
        uuid: doc._id,
        username: usernameMap.get(doc._id) || 'Unknown',
        ...formatted,
      };
    });

    return {
      totalFarmers: records.length,
      totalCrops: records.reduce((sum, r) => sum + r.totalPlots, 0),
      totalReadyCrops: records.reduce((sum, r) => sum + r.readyCount, 0),
      records,
    };
  }

  async getAllJobsAdmin() {
    const uuids = await operatorRepo.findAllJobOwnerUuids();
    const usernameMap = await operatorRepo.buildUsernameMap(uuids);

    const records = await Promise.all(
      uuids.map(async (uuid) => {
        const data = await jobService.getMyJobs(uuid);
        return {
          uuid,
          username: usernameMap.get(uuid) || 'Unknown',
          ...data,
        };
      })
    );

    return {
      totalPlayers: records.length,
      records,
    };
  }

  async scanItemServerWide(keyword, options = {}) {
    if (!keyword || String(keyword).trim() === '') {
      throw AppError.badRequest('VALIDATION_ERROR');
    }

    const cleanKeyword = String(keyword).trim().normalize('NFC');
    const normalizedKeyword = cleanKeyword.toLowerCase();
    const players = await operatorRepo.findAllPlayerUsernamesForScan(200);
    const matches = [];

    const CHUNK_SIZE = 20;
    for (let i = 0; i < players.length; i += CHUNK_SIZE) {
      const chunk = players.slice(i, i + CHUNK_SIZE);

      const chunkResults = await Promise.all(
        chunk.map(async (p) => {
          if (!p.username) return null;

          const [baseFound, mountItems] = await Promise.all([
            playerService.searchMyInventory(
              { uuid: p._id, username: p.username },
              cleanKeyword,
              options
            ),
            this.searchPlayerMountStorage(p._id, normalizedKeyword, options),
          ]);

          const baseItems = Array.isArray(baseFound)
            ? baseFound
            : baseFound?.items || baseFound?.matches || baseFound?.results || [];

          const combinedItems = [...baseItems, ...mountItems];
          if (combinedItems.length === 0) return null;

          const totalQuantity = combinedItems.reduce(
            (sum, item) => sum + (Number(item.amount || item.count) || 1),
            0
          );

          return {
            uuid: p._id,
            username: p.username,
            totalMatched: combinedItems.length,
            totalQuantity,
            items: combinedItems,
          };
        })
      );

      for (const res of chunkResults) {
        if (res) matches.push(res);
      }
    }

    return {
      keyword: cleanKeyword,
      matchedPlayersCount: matches.length,
      matches,
    };
  }

  async getAuditLogs({ targetUsername, status, limit } = {}) {
    const filter = {};
    if (targetUsername) filter.targetUsername = targetUsername;
    if (status) filter.status = status.toUpperCase();
    return operatorRepo.findActions(filter, limit);
  }

  // ======================== 3. QUYỀN GHI/XÓA CÓ GIỚI HẠN (WD) ========================

  validateModeratorConstraints(policy, action, payload = {}) {
    const allowed = Array.isArray(policy.allowedActions) ? policy.allowedActions : [];
    if (!allowed.includes(action)) {
      throw AppError.forbidden('MOD_ACTION_NOT_ALLOWED');
    }

    const limits = policy.limits || {};

    if (action === 'MUTE_PLAYER' && Number(payload.minutes || 0) > limits.maxMuteMinutes) {
      throw AppError.forbidden('MOD_LIMIT_EXCEEDED', { limit: `${limits.maxMuteMinutes}m` });
    }

    if (action === 'EXTEND_WAYSTONE_TAX' && Number(payload.days || 0) > limits.maxTaxExtendDays) {
      throw AppError.forbidden('MOD_LIMIT_EXCEEDED', { limit: `${limits.maxTaxExtendDays}d` });
    }

    if (action === 'SEND_COMPENSATION' && Number(payload.coins || 0) > limits.maxCompensateCoins) {
      throw AppError.forbidden('MOD_LIMIT_EXCEEDED', { limit: limits.maxCompensateCoins });
    }
  }

  async executePlayerAction(actor, { targetUsername, action, payload = {}, reason = '' }) {
    if (!targetUsername || !action) {
      throw AppError.badRequest('VALIDATION_ERROR');
    }

    const normalizedAction = String(action).trim().toUpperCase();
    const target = await this.resolveTargetPlayer(targetUsername);

    // Nếu là MODERATOR -> kiểm tra whitelist & ngưỡng giới hạn do ADMIN đề ra
    if (actor.role === 'MODERATOR') {
      // Không cho phép MODERATOR thực thi lệnh lên ADMIN hoặc MODERATOR ngang cấp
      const targetWeb = await operatorRepo.findWebAccountByUuid(target._id);
      const targetRole = targetWeb?.role || 'USER';
      if (targetRole === 'MODERATOR' || targetRole === 'ADMIN') {
        throw AppError.forbidden('MOD_ACTION_NOT_ALLOWED');
      }

      const policy = await operatorRepo.getModeratorPolicy();
      this.validateModeratorConstraints(policy, normalizedAction, payload);
    }

    return operatorRepo.enqueueAction({
      actorUuid: actor.uuid,
      actorUsername: actor.username,
      actorRole: actor.role,
      targetUuid: target._id,
      targetUsername: target.username,
      action: normalizedAction,
      payload,
      reason: String(reason || '').trim(),
      status: 'PENDING',
    });
  }

  // ======================== 4. ĐẶC QUYỀN ADMIN (WRD FULL) ========================

  async getModeratorPolicy() {
    return operatorRepo.getModeratorPolicy();
  }

  async updateModeratorPolicy(adminUser, body) {
    return operatorRepo.updateModeratorPolicy({
      allowedActions: body.allowedActions,
      limits: body.limits,
      updatedBy: adminUser.username,
    });
  }

  async getStaffList() {
    return operatorRepo.findStaffAccounts();
  }

  async assignRole(adminUser, targetUsername, newRole) {
    const normalizedRole = String(newRole || '').trim().toUpperCase();
    if (!VALID_ROLES.includes(normalizedRole)) {
      throw AppError.badRequest('INVALID_ROLE');
    }

    const target = await this.resolveTargetPlayer(targetUsername);

    if (target._id === adminUser.uuid) {
      throw AppError.badRequest('CANNOT_MODIFY_SELF_ROLE');
    }

    // Đảm bảo bản ghi web_accounts tồn tại ngay cả khi người chơi chưa từng login web
    await authRepo.findOrCreateWebAccount(target._id, target.username);
    return authRepo.updateRoleByUuid(target._id, normalizedRole);
  }
}

module.exports = new OperatorService();