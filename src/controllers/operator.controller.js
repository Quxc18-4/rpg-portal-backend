const operatorService = require('../services/operator.service');
const safezoneService = require('../services/safezone.service');
const denService = require('../services/den.service');
const ecosystemService = require('../services/ecosystem.service');
const rewardService = require('../services/reward.service');
const licenseService = require('../services/license.service');
const licenseBetService = require('../services/licenseBet.service');
const ApiResponse = require('../utils/apiResponse.util');
const { resolveLang } = require('../utils/language.util');

class OperatorController {
  // --- VIEW ALL ---
  async getAllPlayers(req, res, next) {
    try {
      const data = await operatorService.getAllPlayersOverview(req.query);
      return ApiResponse.success(res, data, 'OPERATOR_PLAYERS_LIST_SUCCESS');
    } catch (error) {
      next(error);
    }
  }

  async getAllWaystones(req, res, next) {
    try {
      const data = await operatorService.getAllWaystonesAdmin();
      return ApiResponse.success(res, data, 'OPERATOR_WAYSTONES_ALL_SUCCESS');
    } catch (error) {
      next(error);
    }
  }

  async scanServerItems(req, res, next) {
    try {
      const includeRaw = req.query.raw === 'true';
      const lang = resolveLang(req);
      const data = await operatorService.scanItemServerWide(req.query.q, { includeRaw, lang });
      return ApiResponse.success(res, data, 'OPERATOR_GLOBAL_SEARCH_SUCCESS');
    } catch (error) {
      next(error);
    }
  }

  // --- INSPECT TỪNG NGƯỜI CHƠI ---
  async inspectPlayer(req, res, next) {
    try {
      const includeRaw = req.query.raw === 'true';
      const lang = resolveLang(req);
      const data = await operatorService.inspectPlayerOverview(req.params.username, {
        includeRaw,
        lang,
      });
      return ApiResponse.success(res, data, 'ADMIN_INSPECT_SUCCESS');
    } catch (error) {
      next(error);
    }
  }

  async inspectPlayerInventory(req, res, next) {
    try {
      const includeRaw = req.query.raw === 'true';
      const lang = resolveLang(req);
      const data = await operatorService.inspectPlayerInventory(req.params.username, {
        includeRaw,
        lang,
      });
      return ApiResponse.success(res, data, 'ADMIN_INSPECT_SUCCESS');
    } catch (error) {
      next(error);
    }
  }

  async inspectPlayerJobs(req, res, next) {
    try {
      const data = await operatorService.inspectPlayerJobs(req.params.username);
      return ApiResponse.success(res, data, 'ADMIN_INSPECT_SUCCESS');
    } catch (error) {
      next(error);
    }
  }

  async inspectPlayerMounts(req, res, next) {
    try {
      const includeRaw = req.query.raw === 'true';
      const data = await operatorService.inspectPlayerMounts(req.params.username, { includeRaw });
      return ApiResponse.success(res, data, 'ADMIN_INSPECT_SUCCESS');
    } catch (error) {
      next(error);
    }
  }

  async inspectPlayerCrops(req, res, next) {
    try {
      const data = await operatorService.inspectPlayerCrops(req.params.username);
      return ApiResponse.success(res, data, 'ADMIN_INSPECT_SUCCESS');
    } catch (error) {
      next(error);
    }
  }

  async inspectPlayerWaystones(req, res, next) {
    try {
      const data = await operatorService.inspectPlayerWaystones(req.params.username);
      return ApiResponse.success(res, data, 'ADMIN_INSPECT_SUCCESS');
    } catch (error) {
      next(error);
    }
  }

  async searchPlayerInventory(req, res, next) {
    try {
      const includeRaw = req.query.raw === 'true';
      const lang = resolveLang(req);
      const data = await operatorService.searchPlayerInventory(
        req.params.username,
        req.query.q,
        { includeRaw, lang }
      );
      return ApiResponse.success(res, data, 'SEARCH_SUCCESS');
    } catch (error) {
      next(error);
    }
  }

  // --- ACTIONS & ADMIN CONFIG ---
  async executeAction(req, res, next) {
    try {
      const data = await operatorService.executePlayerAction(req.user, {
        targetUsername: req.params.username,
        action: req.body.action,
        payload: req.body.payload,
        reason: req.body.reason,
      });
      return ApiResponse.success(res, data, 'ACTION_QUEUED_SUCCESS', 201);
    } catch (error) {
      next(error);
    }
  }

  async getAuditLogs(req, res, next) {
    try {
      const data = await operatorService.getAuditLogs(req.query);
      return ApiResponse.success(res, data, 'ADMIN_INSPECT_SUCCESS');
    } catch (error) {
      next(error);
    }
  }

  async getModeratorPolicy(req, res, next) {
    try {
      const data = await operatorService.getModeratorPolicy();
      return ApiResponse.success(res, data, 'ADMIN_INSPECT_SUCCESS');
    } catch (error) {
      next(error);
    }
  }

  async updateModeratorPolicy(req, res, next) {
    try {
      const data = await operatorService.updateModeratorPolicy(req.user, req.body);
      return ApiResponse.success(res, data, 'POLICY_UPDATED_SUCCESS');
    } catch (error) {
      next(error);
    }
  }

  async getStaffList(req, res, next) {
    try {
      const data = await operatorService.getStaffList();
      return ApiResponse.success(res, data, 'ADMIN_INSPECT_SUCCESS');
    } catch (error) {
      next(error);
    }
  }

  async assignRole(req, res, next) {
    try {
      const data = await operatorService.assignRole(
        req.user,
        req.params.username,
        req.body.role
      );
      return ApiResponse.success(res, data, 'ROLE_UPDATED_SUCCESS');
    } catch (error) {
      next(error);
    }
  }
  async getAllMounts(req, res, next) {
    try {
      const includeRaw = req.query.raw === 'true';
      const data = await operatorService.getAllMountsAdmin({ includeRaw });
      return ApiResponse.success(res, data, 'OPERATOR_MOUNTS_ALL_SUCCESS');
    } catch (error) {
      next(error);
    }
  }

  async getAllCrops(req, res, next) {
    try {
      const data = await operatorService.getAllCropsAdmin();
      return ApiResponse.success(res, data, 'OPERATOR_CROPS_ALL_SUCCESS');
    } catch (error) {
      next(error);
    }
  }

  async getAllJobs(req, res, next) {
    try {
      const data = await operatorService.getAllJobsAdmin();
      return ApiResponse.success(res, data, 'OPERATOR_JOBS_ALL_SUCCESS');
    } catch (error) {
      next(error);
    }
  }
  async getAllSafezones(req, res, next) {
    try {
      const data = await safezoneService.getAllSafezones();
      return ApiResponse.success(res, data, 'WORLD_SAFEZONES_SUCCESS');
    } catch (error) {
      next(error);
    }
  }

  async getAllDens(req, res, next) {
    try {
      const data = await denService.getDens({ includeExpired: true });
      return ApiResponse.success(res, data, 'WORLD_DENS_SUCCESS');
    } catch (error) {
      next(error);
    }
  }

  async getAllEcosystems(req, res, next) {
    try {
      const data = await ecosystemService.getAllEcosystems();
      return ApiResponse.success(res, data, 'WORLD_ECOSYSTEMS_SUCCESS');
    } catch (error) {
      next(error);
    }
  }
  // Thêm vào trong class OperatorController:
  async getAllRewards(req, res, next) {
    try {
      const data = await rewardService.getAllRewardsAdmin();
      return ApiResponse.success(res, data, 'OPERATOR_REWARDS_ALL_SUCCESS');
    } catch (error) {
      next(error);
    }
  }

  async inspectPlayerRewards(req, res, next) {
    try {
      const target = await operatorService.resolveTargetPlayer(req.params.username);
      const includeRaw = req.query.raw === 'true';
      const data = await rewardService.getPlayerRewards(target._id, { includeRaw });
      return ApiResponse.success(res, data, 'ADMIN_INSPECT_SUCCESS');
    } catch (error) {
      next(error);
    }
  }

  async getAllLicenses(req, res, next) {
    try {
      const { status, q, page, limit } = req.query;
      const data = await licenseService.getLicenses({
        viewerUuid: null,
        includeFullContributors: true,
        status,
        q,
        page,
        limit,
      });
      return ApiResponse.success(res, data, 'MARKET_LICENSES_SUCCESS');
    } catch (error) {
      next(error);
    }
  }
  // Thêm vào trong class OperatorController:
  async getAllLicenseBets(req, res, next) {
    try {
      const { status, itemId, page, limit } = req.query;
      const data = await licenseBetService.getAllBetsAdmin({ status, itemId, page, limit });
      return ApiResponse.success(res, data, 'BET_LIST_SUCCESS');
    } catch (error) {
      next(error);
    }
  }

  async triggerLicenseBetSettlement(req, res, next) {
    try {
      const data = await licenseBetService.processPendingSettlements();
      return ApiResponse.success(res, data, 'OPERATOR_ACTION_SUCCESS');
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new OperatorController();