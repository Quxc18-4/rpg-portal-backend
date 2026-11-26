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

  async getMyGuildVault(req, res, next) {
    try {
      const includeRaw = req.query.raw === 'true';
      const lang = resolveLang(req);
      const data = await guildService.getMyGuildVault(req.user, {
        page: req.query.page,
        pages: req.query.pages,
        q: req.query.q,
        itemPage: req.query.itemPage,
        itemLimit: req.query.itemLimit,
        includeRaw,
        lang,
      });
      return ApiResponse.success(res, data, 'GUILD_VAULT_SUCCESS');
    } catch (error) {
      next(error);
    }
  }

  async getGuildVaultById(req, res, next) {
    try {
      const includeRaw = req.query.raw === 'true';
      const lang = resolveLang(req);
      const data = await guildService.getGuildVaultById(req.params.id, req.user, {
        page: req.query.page,
        pages: req.query.pages,
        q: req.query.q,
        itemPage: req.query.itemPage,
        itemLimit: req.query.itemLimit,
        includeRaw,
        lang,
      });
      return ApiResponse.success(res, data, 'GUILD_VAULT_SUCCESS');
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