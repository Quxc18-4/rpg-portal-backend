const guildService = require('./guild.service');
const ApiResponse = require('../../utils/apiResponse.util');
const { resolveLang } = require('../../utils/language.util');

class GuildController {
  async getGuilds(req, res, next) {
    try {
      const data = await guildService.getGuilds(req.query);
      return ApiResponse.success(res, data, 'GUILDS_LIST_SUCCESS');
    } catch (error) {
      next(error);
    }
  }

  async getMyGuild(req, res, next) {
    try {
      const includeRaw = req.query.raw === 'true';
      const lang = resolveLang(req);
      const data = await guildService.getMyGuild(req.user, { includeRaw, lang });
      return ApiResponse.success(res, data, 'GUILD_DETAIL_SUCCESS');
    } catch (error) {
      next(error);
    }
  }

  async getGuildById(req, res, next) {
    try {
      const includeRaw = req.query.raw === 'true';
      const lang = resolveLang(req);
      const data = await guildService.getGuildById(req.params.id, req.user, { includeRaw, lang });
      return ApiResponse.success(res, data, 'GUILD_DETAIL_SUCCESS');
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new GuildController();