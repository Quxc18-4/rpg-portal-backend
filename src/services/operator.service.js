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

  async searchPlayerInventory(username, keyword, options = {}) {
    const target = await this.resolveTargetPlayer(username);
    return playerService.searchMyInventory({ username: target.username }, keyword, options);
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

  async scanItemServerWide(keyword, options = {}) {
    if (!keyword || String(keyword).trim() === '') {
      throw AppError.badRequest('VALIDATION_ERROR');
    }

    const players = await operatorRepo.findAllPlayerUsernamesForScan(200);
    const matches = [];

    for (const p of players) {
      if (!p.username) continue;
      const found = await playerService.searchMyInventory(
        { username: p.username },
        keyword,
        options
      );
      if (found && found.totalMatched > 0) {
        matches.push({
          uuid: p._id,
          username: p.username,
          totalMatched: found.totalMatched,
          totalQuantity: found.totalQuantity,
          items: found.items,
        });
      }
    }

    return {
      keyword: String(keyword).trim(),
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