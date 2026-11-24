const npcLookupService = require('./npcLookup.service');
const ApiResponse = require('../../utils/apiResponse.util');
const { resolveLang } = require('../../utils/language.util');

class NpcLookupController {
  async searchNpcItems(req, res, next) {
    try {
      const lang = resolveLang(req);
      const data = await npcLookupService.searchNpcItems({
        query: req.query.q,
        user: req.user,
        lang,
      });
      return ApiResponse.success(res, data, 'NPC_LOOKUP_SUCCESS');
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new NpcLookupController();