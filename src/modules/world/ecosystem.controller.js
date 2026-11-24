const ecosystemService = require('./ecosystem.service');
const ApiResponse = require('../../utils/apiResponse.util');

class EcosystemController {
  async getEcosystems(req, res, next) {
    try {
      const data = await ecosystemService.getAllEcosystems();
      return ApiResponse.success(res, data, 'WORLD_ECOSYSTEMS_SUCCESS');
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new EcosystemController();