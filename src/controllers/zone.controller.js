const zoneService = require('../services/zone.service');
const ApiResponse = require('../utils/apiResponse.util');

class ZoneController {
  async getZones(req, res, next) {
    try {
      const data = await zoneService.getWorldZones();
      return ApiResponse.success(res, data);
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new ZoneController();
