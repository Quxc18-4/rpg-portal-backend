const safezoneService = require('../services/safezone.service');
const ApiResponse = require('../utils/apiResponse.util');

class SafezoneController {
  async getSafezones(req, res, next) {
    try {
      const data = await safezoneService.getAllSafezones();
      return ApiResponse.success(res, data, 'WORLD_SAFEZONES_SUCCESS');
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new SafezoneController();