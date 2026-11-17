const playerService = require('../services/player.service');
const ApiResponse = require('../utils/apiResponse.util');

class PlayerController {
  async getLeaderboard(req, res, next) {
    try {
      const data = await playerService.getLeaderboard();
      return ApiResponse.success(res, data, 'Lấy bảng xếp hạng thành công');
    } catch (error) {
      next(error);
    }
  }

  async getProfile(req, res, next) {
    try {
      // Truyền req.user (đã được optionalAuth giải mã từ Bearer Token) xuống Service
      const data = await playerService.getProfile(req.params.username, req.user);
      return ApiResponse.success(res, data, 'Lấy thông tin nhân vật thành công');
    } catch (error) {
      next(error);
    }
  }

  async getMe(req, res, next) {
    try {
      const data = await playerService.getMyProfile(req.user);
      return ApiResponse.success(res, data, 'Lấy hồ sơ cá nhân thành công');
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new PlayerController();