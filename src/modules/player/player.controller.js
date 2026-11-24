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
      // Truyền req.user (đã được optionalAuth giải mã từ Bearer Token) xuống Service
      const data = await playerService.getProfile(req.params.username, req.user);
      return ApiResponse.success(res, data, 'PROFILE_SUCCESS');
    } catch (error) {
      next(error);
    }
  }

  async getMe(req, res, next) {
    try {
      const data = await playerService.getMyProfile(req.user);
      return ApiResponse.success(res, data, 'ME_SUCCESS');
    } catch (error) {
      next(error);
    }
  }

  async getMyInventory(req, res, next) {
    try {
      const includeRaw = req.query.raw === 'true';
      const lang = resolveLang(req);
      const data = await playerService.getMyInventory(req.user, { includeRaw, lang });
      return ApiResponse.success(res, data, 'INVENTORY_SUCCESS');
    } catch (error) {
      next(error);
    }
  }

  async searchMyInventory(req, res, next) {
    try {
      const includeRaw = req.query.raw === 'true';
      const lang = resolveLang(req);
      const data = await playerService.searchMyInventory(req.user, req.query.q, { includeRaw, lang });
      return ApiResponse.success(res, data, 'SEARCH_SUCCESS');
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new PlayerController();