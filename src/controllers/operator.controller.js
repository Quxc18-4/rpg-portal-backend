const operatorService = require('../services/operator.service');
const ApiResponse = require('../utils/apiResponse.util');
const { resolveLang } = require('../utils/language.util');

class OperatorController {
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
}

module.exports = new OperatorController();