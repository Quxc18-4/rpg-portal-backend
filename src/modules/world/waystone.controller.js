const waystoneService = require('./waystone.service');
const ApiResponse = require('../../utils/apiResponse.util');

class WaystoneController {
  async getMyWaystones(req, res, next) {
    try {
      const data = await waystoneService.getMyWaystones(req.user.uuid);
      return ApiResponse.success(res, data, 'WAYSTONES_SUCCESS');
    } catch (error) {
      next(error);
    }
  }

  async getWorldWaystones(req, res, next) {
    try {
      const data = await waystoneService.getWorldWaystones(req.user);
      return ApiResponse.success(res, data, 'WORLD_WAYSTONES_SUCCESS');
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new WaystoneController();