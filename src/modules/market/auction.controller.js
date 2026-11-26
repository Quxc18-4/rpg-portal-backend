const auctionService = require('./auction.service');
const ApiResponse = require('../../utils/apiResponse.util');
const { resolveLang } = require('../../utils/language.util');

class AuctionController {
  async getActiveAuctions(req, res, next) {
    try {
      const includeRaw = req.query.raw === 'true';
      const lang = resolveLang(req);
      const data = await auctionService.getActiveAuctions(req.query, req.user, {
        includeRaw,
        lang,
      });
      return ApiResponse.success(res, data, 'MARKET_AUCTIONS_SUCCESS');
    } catch (error) {
      next(error);
    }
  }

  async getAuctionHistory(req, res, next) {
    try {
      const includeRaw = req.query.raw === 'true';
      const lang = resolveLang(req);
      const data = await auctionService.getAuctionHistory(req.query, req.user, {
        includeRaw,
        lang,
      });
      return ApiResponse.success(res, data, 'MARKET_AUCTION_HISTORY_SUCCESS');
    } catch (error) {
      next(error);
    }
  }

  async getAuctionById(req, res, next) {
    try {
      const includeRaw = req.query.raw === 'true';
      const lang = resolveLang(req);
      const data = await auctionService.getAuctionById(req.params.id, {
        includeRaw,
        lang,
      });
      return ApiResponse.success(res, data, 'MARKET_AUCTION_DETAIL_SUCCESS');
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new AuctionController();