const playerService = require('./player.service');
const ApiResponse = require('../../utils/apiResponse.util');
const { resolveLang } = require('../../utils/language.util');

class PlayerController {
  async getLeaderboard(req, res, next) {
    try {
      const data = await playerService.getLeaderboard();
      return ApiResponse.success(res, data, 'LEADERBOARD_SUCCESS');
    } catch (error) {
      next(error);
    }
  }

  async getProfile(req, res, next) {
    try {
      const slot = req.query.slot !== undefined ? Number(req.query.slot) : null;
      const data = await playerService.getProfile(req.params.username, req.user, slot);
      return ApiResponse.success(res, data, 'PROFILE_SUCCESS');
    } catch (error) {
      next(error);
    }
  }

  async getMe(req, res, next) {
    try {
      const slot = req.query.slot !== undefined ? Number(req.query.slot) : null;
      const data = await playerService.getMyProfile(req.user, slot);
      return ApiResponse.success(res, data, 'ME_SUCCESS');
    } catch (error) {
      next(error);
    }
  }

  async getMyInventory(req, res, next) {
    try {
      const includeRaw = req.query.raw === 'true';
      const lang = resolveLang(req);
      const slot = req.query.slot !== undefined ? Number(req.query.slot) : null;
      const data = await playerService.getMyInventory(req.user, { includeRaw, lang, slot });
      return ApiResponse.success(res, data, 'INVENTORY_SUCCESS');
    } catch (error) {
      next(error);
    }
  }

  async searchMyInventory(req, res, next) {
    try {
      const includeRaw = req.query.raw === 'true';
      const lang = resolveLang(req);
      const slot = req.query.slot !== undefined ? Number(req.query.slot) : null;
      const data = await playerService.searchMyInventory(req.user, req.query.q, {
        includeRaw,
        lang,
        slot,
      });
      return ApiResponse.success(res, data, 'SEARCH_SUCCESS');
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new PlayerController();