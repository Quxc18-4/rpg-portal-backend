const rewardService = require('../services/reward.service');
const ApiResponse = require('../utils/apiResponse.util');
const { resolveLang } = require('../utils/language.util');

class RewardController {
  async getMyRewards(req, res, next) {
    try {
      const includeRaw = req.query.raw === 'true';
      const lang = resolveLang(req);
      const data = await rewardService.getPlayerRewards(req.user.uuid, { includeRaw, lang });
      return ApiResponse.success(res, data, 'PLAYER_REWARDS_SUCCESS');
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new RewardController();