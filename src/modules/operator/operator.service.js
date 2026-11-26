const operatorRepo = require('./operator.repository');
const playerRepo = require('../player/player.repository');
const authRepo = require('../auth/auth.repository');
const cropRepo = require('../world/crop.repository');
const playerService = require('../player/player.service');
const jobService = require('../player/job.service');
const mountService = require('../player/mount.service');
const cropService = require('../world/crop.service');
const waystoneService = require('../world/waystone.service');
const questService = require('../player/quest.service');
const guildService = require('../guild/guild.service');
const auctionService = require('../market/auction.service');
const tradeService = require('../market/trade.service');
const { formatCurrency } = require('../../utils/currency.util');
const { AppError } = require('../../utils/error.util');
const { matchDecodedItem } = require('../../utils/itemDecoder.util');

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
      playerService.getProfile(target.username, ownerViewer, options.slot),
      playerService.getMyInventory(ownerViewer, options),
      jobService.getMyJobs(target._id),
      mountService.getMyMounts(target._id, options),
      cropService.getMyCrops(target._id),
      waystoneService.getMyWaystones(target._id),
    ]);

    return { profile, inventory, jobs, mounts, crops, waystones };
  }

  async searchPlayerAllCharacterSlots(playerDoc, keyword, options = {}) {
    const slotsObj =
      playerDoc.slots && typeof playerDoc.slots === 'object' ? playerDoc.slots : null;
    const slotKeys = slotsObj && Object.keys(slotsObj).length > 0 ? Object.keys(slotsObj) : ['1'];

    const ownerViewer = { uuid: playerDoc._id, username: playerDoc.username };
    const allResults = [];

    for (const slotKey of slotKeys) {
      const slotNum = Number(slotKey);
      if (!Number.isInteger(slotNum) || slotNum < 1 || slotNum > 10) continue;

      try {
        const found = await playerService.searchMyInventory(ownerViewer, keyword, {
          ...options,
          slot: slotNum,
        });
        if (Array.isArray(found?.results)) {
          allResults.push(...found.results);
        }
      } catch (_) {
        // Bỏ qua slot trống/lỗi
      }
    }

    return allResults;
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

  async searchPlayerMountStorage(uuid, keyword, options = {}) {
    const mountData = await mountService.getMyMounts(uuid, options);
    const mountsList = Array.isArray(mountData?.mounts) ? mountData.mounts : [];
    const matchedMountItems = [];

    for (const mount of mountsList) {
      const slotId = mount.slot ?? '?';
      const mountLabel = mount.customName || mount.type || `Mount #${slotId}`;
      const saddleItems = Array.isArray(mount.saddleStorage?.items)
        ? mount.saddleStorage.items
        : [];

      for (const item of saddleItems) {
        if (matchDecodedItem(item, keyword)) {
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
    const cleanKeyword = String(keyword).trim().normalize('NFC');

    const [baseItems, mountItems] = await Promise.all([
      this.searchPlayerAllCharacterSlots(target, cleanKeyword, options),
      this.searchPlayerMountStorage(target._id, cleanKeyword, options),
    ]);

    const combinedItems = [...baseItems, ...mountItems];
    const totalQuantity = combinedItems.reduce(
      (sum, item) => sum + (Number(item.amount || item.count) || 1),
      0
    );

    return {
      uuid: target._id,
      username: target.username,
      keyword: cleanKeyword,
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

  async getAllCropsAdmin() {
    const uuids = await cropRepo.findAllOwnerUuids();
    const usernameMap = await operatorRepo.buildUsernameMap(uuids);

    const records = await Promise.all(
      uuids.map(async (uuid) => {
        const data = await cropService.getMyCrops(uuid);
        return {
          uuid,
          username: usernameMap.get(uuid) || 'Unknown',
          ...data,
        };
      })
    );

    return {
      totalFarmers: records.length,
      totalCrops: records.reduce((sum, r) => sum + (Number(r.totalPlots) || 0), 0),
      totalReadyCrops: records.reduce((sum, r) => sum + (Number(r.readyCount) || 0), 0),
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
    const players = await operatorRepo.findAllPlayerUsernamesForScan(200);
    const matches = [];

    const CHUNK_SIZE = 20;
    for (let i = 0; i < players.length; i += CHUNK_SIZE) {
      const chunk = players.slice(i, i + CHUNK_SIZE);

      const chunkResults = await Promise.all(
        chunk.map(async (p) => {
          if (!p.username) return null;

          const [baseItems, mountItems] = await Promise.all([
            this.searchPlayerAllCharacterSlots(p, cleanKeyword, options),
            this.searchPlayerMountStorage(p._id, cleanKeyword, options),
          ]);

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

  async inspectPlayerQuests(username) {
    const target = await this.resolveTargetPlayer(username);
    return questService.getPlayerQuests(target._id);
  }

  async getAllGuildsAdmin(options = {}) {
    return guildService.getAllGuildsAdmin(options);
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

  // ======================== 5. KIỂM TOÁN KINH TẾ & CHỢ ========================

  async resolveOptionalPlayerUuid(identifier) {
    if (!identifier || String(identifier).trim() === '') return '';
    const clean = String(identifier).trim();
    const found = await playerRepo.findByUsername(clean);
    return found ? found._id : clean;
  }

  async getEconomyOverview() {
    const metrics = await operatorRepo.getEconomyOverviewMetrics();

    const playerCopper = Number(metrics.playerCirculationRaw || 0);
    const guildCopper = Number(metrics.guildBankTotalRaw || 0);
    const activeAuctionCopper = Number(metrics.activeAuctionListedRaw || 0);
    const soldAuctionCopper = Number(metrics.soldAuctionVolumeRaw || 0);

    return {
      generatedAt: new Date().toISOString(),
      players: {
        total: metrics.totalPlayers,
        vipCount: metrics.vipCount,
        totalWalletCirculation: formatCurrency(playerCopper),
      },
      guilds: {
        total: metrics.totalGuilds,
        totalBankReserves: formatCurrency(guildCopper),
      },
      economy: {
        totalTrackedMoneySupply: formatCurrency(playerCopper + guildCopper),
        auctionHouse: {
          activeListings: metrics.activeAuctionsCount,
          activeListedValue: formatCurrency(activeAuctionCopper),
          completedSales: metrics.soldAuctionsCount,
          completedSalesVolume: formatCurrency(soldAuctionCopper),
        },
        directTrades: {
          totalCompletedTrades: metrics.totalTradesCount,
        },
      },
    };
  }

  async getAllAuctionsAdmin(query = {}, options = {}) {
    const adminViewer = { uuid: 'SYSTEM_ADMIN', role: 'ADMIN' };
    const source = String(query.source || 'ACTIVE').trim().toUpperCase();

    if (source === 'HISTORY') {
      return auctionService.getAuctionHistory(query, adminViewer, options);
    }
    return auctionService.getActiveAuctions(query, adminViewer, options);
  }

  async getAllTradesAdmin(query = {}, options = {}) {
    const adminViewer = { uuid: 'SYSTEM_ADMIN', role: 'ADMIN' };
    const resolvedQuery = { ...query };

    if (resolvedQuery.player) {
      resolvedQuery.player = await this.resolveOptionalPlayerUuid(resolvedQuery.player);
    }
    if (resolvedQuery.partner) {
      resolvedQuery.partner = await this.resolveOptionalPlayerUuid(resolvedQuery.partner);
    }

    return tradeService.getTrades(resolvedQuery, adminViewer, options);
  }

  async inspectPlayerAuctions(username, query = {}, options = {}) {
    const target = await this.resolveTargetPlayer(username);
    const subjectViewer = { uuid: target._id, role: 'PLAYER' };

    const [active, history] = await Promise.all([
      auctionService.getActiveAuctions(
        { sellerUuid: target._id, page: query.page || 1, limit: query.limit || 20 },
        { uuid: 'SYSTEM_ADMIN', role: 'ADMIN' },
        options
      ),
      auctionService.getAuctionHistory(
        {
          mine: 'true',
          role: query.role || 'all',
          status: query.status || '',
          page: query.page || 1,
          limit: query.limit || 20,
        },
        subjectViewer,
        options
      ),
    ]);

    return {
      uuid: target._id,
      username: target.username,
      active,
      history,
    };
  }

  async inspectPlayerTrades(username, query = {}, options = {}) {
    const target = await this.resolveTargetPlayer(username);
    const subjectViewer = { uuid: target._id, role: 'PLAYER' };

    const trades = await tradeService.getTrades(
      query,
      subjectViewer,
      options,
      { forceMine: true }
    );

    return {
      uuid: target._id,
      username: target.username,
      ...trades,
    };
  }

  async getEconomyAuditFeed(query = {}, options = {}) {
    const {
      type = 'ALL',
      player = '',
      q = '',
      minCopper = 0,
      oneSidedOnly = 'false',
      from,
      to,
      page = 1,
      limit = 20,
    } = query;

    const safePage = Math.max(1, Number(page) || 1);
    const safeLimit = Math.min(50, Math.max(1, Number(limit) || 20));
    const normalizedType = String(type || 'ALL').trim().toUpperCase();
    const minThreshold = Math.max(0, Number(minCopper) || 0);
    const onlyOneSided = String(oneSidedOnly) === 'true';

    const targetUuid = await this.resolveOptionalPlayerUuid(player);
    const adminViewer = { uuid: 'SYSTEM_ADMIN', role: 'ADMIN' };
    const entries = [];

    if (normalizedType === 'ALL' || normalizedType === 'AUCTION') {
      const auctionQuery = { q, page: 1, limit: 50 };
      if (targetUuid) {
        auctionQuery.mine = 'true';
        auctionQuery.role = 'all';
      }
      const subject = targetUuid ? { uuid: targetUuid, role: 'PLAYER' } : adminViewer;
      const historyRes = await auctionService.getAuctionHistory(
        auctionQuery,
        subject,
        options
      );

      for (const auc of historyRes.items) {
        const valueRaw = auc.price?.raw || 0;
        const flags = [];
        if (valueRaw >= 4096) flags.push('HIGH_VALUE_AUCTION');

        entries.push({
          auditId: `AUCTION:${auc.id}`,
          type: 'AUCTION',
          timestamp: auc.soldAt || auc.listedAt || null,
          valueCopper: valueRaw,
          valueFormatted: auc.price?.formatted || '0 Vàng 0 Bạc 0 Đồng',
          flags,
          participants: {
            from: auc.seller,
            to: auc.buyer,
          },
          summary: auc.item
            ? `${auc.item.displayName || auc.item.type} (x${auc.item.amount})`
            : 'Unknown Item',
          detail: auc,
        });
      }
    }

    if (normalizedType === 'ALL' || normalizedType === 'TRADE') {
      const tradeQuery = {
        player: targetUuid || undefined,
        q,
        from,
        to,
        page: 1,
        limit: 50,
      };
      const tradeRes = await tradeService.getTrades(tradeQuery, adminViewer, options);

      for (const tr of tradeRes.items) {
        const c1 = tr.side1.currency?.raw || 0;
        const c2 = tr.side2.currency?.raw || 0;
        const totalCopper = c1 + c2;

        const isOneSided =
          (tr.side1.itemCount === 0 && tr.side2.itemCount > 0) ||
          (tr.side2.itemCount === 0 && tr.side1.itemCount > 0);

        const flags = [];
        if (isOneSided) flags.push('ONE_SIDED_TRANSFER');
        if (totalCopper >= 4096) flags.push('HIGH_VALUE_CURRENCY');

        entries.push({
          auditId: `TRADE:${tr.id}`,
          type: 'TRADE',
          timestamp: tr.tradedAt || null,
          valueCopper: totalCopper,
          valueFormatted: formatCurrency(totalCopper).formatted,
          flags,
          participants: {
            side1: tr.side1.player,
            side2: tr.side2.player,
          },
          summary: `${tr.side1.player.username} (${tr.side1.itemCount} món) ↔ ${tr.side2.player.username} (${tr.side2.itemCount} món)`,
          detail: tr,
        });
      }
    }

    const filtered = entries.filter((entry) => {
      if (minThreshold > 0 && entry.valueCopper < minThreshold) return false;
      if (onlyOneSided && !entry.flags.includes('ONE_SIDED_TRANSFER')) return false;
      return true;
    });

    filtered.sort((a, b) => {
      const tA = a.timestamp ? Date.parse(a.timestamp) : 0;
      const tB = b.timestamp ? Date.parse(b.timestamp) : 0;
      return tB - tA;
    });

    const start = (safePage - 1) * safeLimit;
    const items = filtered.slice(start, start + safeLimit);

    return {
      items,
      pagination: {
        page: safePage,
        limit: safeLimit,
        total: filtered.length,
        totalPages: Math.max(1, Math.ceil(filtered.length / safeLimit)),
      },
    };
  }
}

module.exports = new OperatorService();