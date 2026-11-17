const playerService = require('../services/player.service');
const ApiResponse = require('../utils/apiResponse.util');

class PlayerController {
  async getLeaderboard(req, res, next) {
    try {
      const data = await playerService.getLeaderboard();
      return ApiResponse.success(res, data);
    } catch (error) {
      next(error);
    }
  }

  async getProfile(req, res, next) {
    try {
      const data = await playerService.getPublicProfile(req.params.username);
      return ApiResponse.success(res, data);
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new PlayerController();
