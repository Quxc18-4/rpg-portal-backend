const cropService = require('../services/crop.service');
const ApiResponse = require('../utils/apiResponse.util');

class CropController {
  async getMyCrops(req, res, next) {
    try {
      const data = await cropService.getMyCrops(req.user.uuid);
      return ApiResponse.success(res, data, 'CROPS_SUCCESS');
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new CropController();