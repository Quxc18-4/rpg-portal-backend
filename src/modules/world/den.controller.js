const denService = require('./den.service');
const ApiResponse = require('../../utils/apiResponse.util');

class DenController {
  async getDens(req, res, next) {
    try {
      const data = await denService.getDens({ includeExpired: false });
      return ApiResponse.success(res, data, 'WORLD_DENS_SUCCESS');
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new DenController();