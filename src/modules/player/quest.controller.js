const questService = require('./quest.service');
const ApiResponse = require('../../utils/apiResponse.util');

class QuestController {
  async getMyQuests(req, res, next) {
    try {
      const data = await questService.getPlayerQuests(req.user.uuid);
      return ApiResponse.success(res, data, 'PLAYER_QUESTS_SUCCESS');
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new QuestController();