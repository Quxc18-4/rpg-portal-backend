const operatorRepo = require('../repositories/operator.repository');
const playerRepo = require('../repositories/player.repository');
const authRepo = require('../repositories/auth.repository');
const playerService = require('./player.service');
const jobService = require('./job.service');
const mountService = require('./mount.service');
const cropService = require('./crop.service');
const waystoneService = require('./waystone.service');
const { AppError } = require('../utils/error.util');

const VALID_ROLES = ['GUEST', 'USER', 'MODERATOR', 'ADMIN'];

class OperatorService {
  // ======================== 1. QUYỀN ĐỌC (R: MODERATOR & ADMIN) ========================

  async inspectPlayerOverview(username, options = {}) {
    const target = await playerRepo.findByUsername(username);
    if (!target) {
      throw AppError.notFound('PLAYER_NOT_FOUND');
    }

    const ownerViewer = { uuid: target._id, username: target.username };

    const [profile, inventory, jobs, mounts, crops, waystones] = await Promise.all([
      playerService.getProfile(target.username, ownerViewer),
      playerService.getMyInventory(ownerViewer, options),
      jobService.getMyJobs(target._id),
      mountService.getMyMounts(target._id, options),
      cropService.getMyCrops(target._id),
      waystoneService.getMyWaystones(target._id),
    ]);

    return {
      profile,
      inventory,
      jobs,
      mounts,
      crops,
      waystones,
    };
  }

  async searchPlayerInventory(username, keyword, options = {}) {
    const target = await playerRepo.findByUsername(username);
    if (!target) {
      throw AppError.notFound('PLAYER_NOT_FOUND');
    }

    return playerService.searchMyInventory({ username: target.username }, keyword, options);
  }

  async getAuditLogs({ targetUsername, status, limit } = {}) {
    const filter = {};
    if (targetUsername) filter.targetUsername = targetUsername;
    if (status) filter.status = status.toUpperCase();
    return operatorRepo.findActions(filter, limit);
  }

  // ======================== 2. QUYỀN GHI/XÓA CÓ GIỚI HẠN (WD) ========================

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
    const target = await playerRepo.findByUsername(targetUsername);
    if (!target) {
      throw AppError.notFound('PLAYER_NOT_FOUND');
    }

    // Nếu là MODERATOR -> kiểm tra whitelist & ngưỡng giới hạn do ADMIN đề ra
    if (actor.role === 'MODERATOR') {
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

  // ======================== 3. ĐẶC QUYỀN ADMIN (WRD FULL) ========================

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

    const target = await playerRepo.findByUsername(targetUsername);
    if (!target) {
      throw AppError.notFound('PLAYER_NOT_FOUND');
    }

    if (target._id === adminUser.uuid) {
      throw AppError.badRequest('CANNOT_MODIFY_SELF_ROLE');
    }

    // Đảm bảo bản ghi web_accounts tồn tại ngay cả khi người chơi chưa từng login web
    await authRepo.findOrCreateWebAccount(target._id, target.username);
    return authRepo.updateRoleByUuid(target._id, normalizedRole);
  }
}

module.exports = new OperatorService();