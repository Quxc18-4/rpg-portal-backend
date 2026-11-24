const zoneService = require('./zone.service');
const ApiResponse = require('../../utils/apiResponse.util');

class ZoneController {
  async getZones(req, res, next) {
    try {
      const data = await zoneService.getWorldZones();
      return ApiResponse.success(res, data);
    } catch (error) {
      next(error);
    }
  }
  async getMyWaystones(req, res, next) {
  try {
    const data = await zoneService.getMyWaystones(req.user.uuid);
    return ApiResponse.success(res, data, 'WAYSTONES_SUCCESS');
  } catch (error) {
    next(error);
  }
}

async getWorldWaystones(req, res, next) {
  try {
    const data = await zoneService.getWorldWaystones(req.user);
    return ApiResponse.success(res, data, 'WORLD_WAYSTONES_SUCCESS');
  } catch (error) {
    next(error);
  }
}
}

module.exports = new ZoneController();
