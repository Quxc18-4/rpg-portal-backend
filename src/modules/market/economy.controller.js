const economyService = require('./economy.service');
const ApiResponse = require('../../utils/apiResponse.util');

class EconomyController {
  async getPrices(req, res, next) {
    try {
      const data = await economyService.getMarketOverview();
      return ApiResponse.success(res, data);
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new EconomyController();
