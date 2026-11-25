const mongoose = require('mongoose');
const friendService = require('../player/friend.service');
const { formatCurrency } = require('../../utils/currency.util');
const { decodeItemStackBase64 } = require('../../utils/itemDecoder.util');
const { AppError } = require('../../utils/error.util');

class GuildService {
  getCollection() {
    return mongoose.connection.db.collection('guilds');
  }

  resolveMemberGuildRole(guildDoc, uuid) {
    if (!guildDoc || !uuid) return null;
    if (guildDoc.leader === uuid) return 'LEADER';

    const viceLeaders = Array.isArray(guildDoc['vice-leaders']) ? guildDoc['vice-leaders'] : [];
    if (viceLeaders.includes(uuid)) return 'VICE_LEADER';

    const members = Array.isArray(guildDoc.members) ? guildDoc.members : [];
    if (members.includes(uuid)) return 'MEMBER';

    return null;
  }

  canViewInternalGuildData(guildDoc, viewerUser) {
    if (!viewerUser || !viewerUser.uuid) return false;
    if (viewerUser.role === 'ADMIN' || viewerUser.role === 'MODERATOR') return true;
    return Boolean(this.resolveMemberGuildRole(guildDoc, viewerUser.uuid));
  }

  decodeGuildVaults(vaultsObj, options = {}) {
    if (!vaultsObj || typeof vaultsObj !== 'object') return [];

    const pages = [];
    const sortedKeys = Object.keys(vaultsObj).sort((a, b) => Number(a) - Number(b));

    for (const pageKey of sortedKeys) {
      const rawVal = vaultsObj[pageKey];
      const base64Str =
        typeof rawVal === 'string'
          ? rawVal
          : rawVal && typeof rawVal === 'object'
          ? Object.values(rawVal).find((v) => typeof v === 'string' && v.startsWith('rO0ABX'))
          : null;

      const items = base64Str ? decodeItemStackBase64(base64Str, options) : [];
      pages.push({
        page: Number.isNaN(Number(pageKey)) ? pageKey : Number(pageKey) + 1,
        rawKey: pageKey,
        capacity: items.capacity || 54,
        usedSlots: items.length,
        items,
      });
    }

    return pages;
  }

  /**
   * Lấy badge bang hội gọn nhẹ để gắn lên Profile người chơi
   */
  async getPlayerGuildBadge(uuid) {
    if (!uuid) return null;
    const guild = await this.getCollection().findOne(
      {
        $or: [{ leader: uuid }, { 'vice-leaders': uuid }, { members: uuid }],
      },
      { projection: { _id: 1, name: 1, leader: 1, 'vice-leaders': 1, members: 1, level: 1 } }
    );

    if (!guild) return null;

    return {
      id: guild._id,
      name: guild.name,
      level: Number(guild.level || 1),
      role: this.resolveMemberGuildRole(guild, uuid),
    };
  }

  /**
   * Danh sách & BXH Bang hội (PUBLIC)
   */
  async getGuilds({ q = '', sortBy = 'level', page = 1, limit = 20 } = {}) {
    const safePage = Math.max(1, Number(page) || 1);
    const safeLimit = Math.min(50, Math.max(1, Number(limit) || 20));
    const skip = (safePage - 1) * safeLimit;

    const filter = {};
    if (q && String(q).trim() !== '') {
      const regex = new RegExp(String(q).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [{ name: regex }, { _id: regex }];
    }

    const sortStage =
      sortBy === 'members'
        ? { memberCount: -1, level: -1, exp: -1 }
        : { level: -1, exp: -1, memberCount: -1 };

    const pipeline = [
      { $match: filter },
      {
        $addFields: {
          memberCount: { $size: { $ifNull: ['$members', []] } },
        },
      },
      { $sort: sortStage },
      { $skip: skip },
      { $limit: safeLimit },
      {
        $project: {
          vaults: 0,
          'bank-balance': 0,
        },
      },
    ];

    const [docs, total] = await Promise.all([
      this.getCollection().aggregate(pipeline).toArray(),
      this.getCollection().countDocuments(filter),
    ]);

    const leaderUuids = [...new Set(docs.map((g) => g.leader).filter(Boolean))];
    const leaderCards = await friendService.hydratePlayerCards(leaderUuids);
    const leaderMap = new Map(leaderCards.map((c) => [c.uuid, c]));

    const items = docs.map((g, index) => {
      const leaderInfo = leaderMap.get(g.leader);
      return {
        rank: skip + index + 1,
        id: g._id,
        name: g.name,
        level: Number(g.level || 1),
        exp: Number(g.exp || 0),
        memberCount: Number(g.memberCount || 0),
        maxMembers: Number(g['max-members'] || 20),
        hasIsland: Boolean(g['has-island']),
        leader: {
          uuid: g.leader,
          username: leaderInfo?.username || 'Unknown',
          isVip: Boolean(leaderInfo?.isVip),
          adventurerRank: leaderInfo?.adventurerRank || 'F-',
        },
      };
    });

    return {
      items,
      pagination: {
        page: safePage,
        limit: safeLimit,
        total,
        totalPages: Math.max(1, Math.ceil(total / safeLimit)),
      },
    };
  }

  /**
   * Chi tiết 1 Bang hội (mở khóa bankBalance + vaults nếu là thành viên bang hoặc Admin/Mod)
   */
  async formatGuildDetail(guildDoc, viewerUser = null, options = {}) {
    const leaderUuid = guildDoc.leader || null;
    const viceLeaders = Array.isArray(guildDoc['vice-leaders']) ? guildDoc['vice-leaders'] : [];
    const rawMembers = Array.isArray(guildDoc.members) ? guildDoc.members : [];

    // Sắp xếp danh sách UUID duy nhất theo thứ bậc: Bang chủ -> Phó bang -> Thành viên
    const orderedUuids = [
      ...new Set([leaderUuid, ...viceLeaders, ...rawMembers].filter(Boolean)),
    ];

    const hydratedCards = await friendService.hydratePlayerCards(orderedUuids);
    const members = hydratedCards.map((card) => ({
      ...card,
      guildRole: this.resolveMemberGuildRole(guildDoc, card.uuid) || 'MEMBER',
    }));

    const isInternalAccess = this.canViewInternalGuildData(guildDoc, viewerUser);
    const viewerGuildRole = viewerUser?.uuid
      ? this.resolveMemberGuildRole(guildDoc, viewerUser.uuid)
      : null;

    const detail = {
      accessLevel: isInternalAccess ? 'MEMBER' : 'PUBLIC',
      viewerGuildRole,
      id: guildDoc._id,
      name: guildDoc.name,
      level: Number(guildDoc.level || 1),
      exp: Number(guildDoc.exp || 0),
      memberCount: members.length,
      maxMembers: Number(guildDoc['max-members'] || 20),
      vaultPagesCount: Number(guildDoc['vault-pages'] || 1),
      hasIsland: Boolean(guildDoc['has-island']),
      islandId: Number(guildDoc['island-id'] ?? -1),
      members,
    };

    if (isInternalAccess) {
      detail.bankBalance = formatCurrency(guildDoc['bank-balance'] || 0);
      detail.vaults = this.decodeGuildVaults(guildDoc.vaults, options);
    }

    return detail;
  }

  async getGuildById(guildId, viewerUser = null, options = {}) {
    const cleanId = String(guildId || '').trim().toLowerCase();
    const guildDoc = await this.getCollection().findOne({
      $or: [{ _id: cleanId }, { name: new RegExp(`^${cleanId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }],
    });

    if (!guildDoc) {
      throw AppError.notFound('GUILD_NOT_FOUND');
    }

    return this.formatGuildDetail(guildDoc, viewerUser, options);
  }

  async getMyGuild(viewerUser, options = {}) {
    const guildDoc = await this.getCollection().findOne({
      $or: [
        { leader: viewerUser.uuid },
        { 'vice-leaders': viewerUser.uuid },
        { members: viewerUser.uuid },
      ],
    });

    if (!guildDoc) {
      return null;
    }

    return this.formatGuildDetail(guildDoc, viewerUser, options);
  }

  /**
   * Góc nhìn Admin: Toàn bộ bang hội kèm quỹ & kho đồ
   */
  async getAllGuildsAdmin(options = {}) {
    const docs = await this.getCollection()
      .find({})
      .sort({ level: -1, exp: -1 })
      .toArray();

    const adminViewer = { uuid: 'SYSTEM_ADMIN', role: 'ADMIN' };
    const guilds = await Promise.all(
      docs.map((doc) => this.formatGuildDetail(doc, adminViewer, options))
    );

    return {
      totalGuilds: guilds.length,
      guilds,
    };
  }
}

module.exports = new GuildService();