const tradeService = require('./trade.service');
const ApiResponse = require('../../utils/apiResponse.util');
const { resolveLang } = require('../../utils/language.util');

class TradeController {
  async getTrades(req, res, next) {
    try {
      const includeRaw = req.query.raw === 'true';
      const lang = resolveLang(req);
      const data = await tradeService.getTrades(req.query, req.user, { includeRaw, lang });
      return ApiResponse.success(res, data, 'MARKET_TRADES_SUCCESS');
    } catch (error) {
      next(error);
    }
  }

  async getMyTrades(req, res, next) {
    try {
      const includeRaw = req.query.raw === 'true';
      const lang = resolveLang(req);
      const data = await tradeService.getTrades(
        req.query,
        req.user,
        { includeRaw, lang },
        { forceMine: true }
      );
      return ApiResponse.success(res, data, 'MARKET_TRADES_SUCCESS');
    } catch (error) {
      next(error);
    }
  }

  async getTradeById(req, res, next) {
    try {
      const includeRaw = req.query.raw === 'true';
      const lang = resolveLang(req);
      const data = await tradeService.getTradeById(req.params.id, req.user, {
        includeRaw,
        lang,
      });
      return ApiResponse.success(res, data, 'MARKET_TRADE_DETAIL_SUCCESS');
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new TradeController();