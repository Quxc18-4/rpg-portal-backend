const licenseBetService = require('../services/licenseBet.service');
const ApiResponse = require('../utils/apiResponse.util');
const { resolveLang } = require('../utils/language.util');

class LicenseBetController {
  async getItemBettingPool(req, res, next) {
    try {
      const lang = resolveLang(req);
      const data = await licenseBetService.getItemBettingPool(req.params.itemId, lang);
      return ApiResponse.success(res, data, 'BET_LIST_SUCCESS');
    } catch (error) {
      next(error);
    }
  }

  async placeBet(req, res, next) {
    try {
      const lang = resolveLang(req);
      const { candidateUuid, amount } = req.body;
      const data = await licenseBetService.placeBet({
        bettorUuid: req.user.uuid,
        bettorUsername: req.user.username,
        itemId: req.params.itemId,
        candidateUuid,
        amount,
        lang,
      });
      return ApiResponse.success(res, data, 'BET_PLACE_SUCCESS', 201);
    } catch (error) {
      next(error);
    }
  }

  async getMyBets(req, res, next) {
    try {
      const { page, limit } = req.query;
      const data = await licenseBetService.getMyBets(req.user.uuid, { page, limit });
      return ApiResponse.success(res, data, 'BET_LIST_SUCCESS');
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new LicenseBetController();