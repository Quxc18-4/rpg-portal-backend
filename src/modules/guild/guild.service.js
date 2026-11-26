const guildRepository = require('./guild.repository');
const friendService = require('../player/friend.service');
const { formatCurrency } = require('../../utils/currency.util');
const { decodeItemStackBase64, matchDecodedItem } = require('../../utils/itemDecoder.util');
const { AppError } = require('../../utils/error.util');

class GuildService {
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

  isVaultNavButton(item) {
    if (!item || typeof item !== 'object') return false;
    const isCornerNavSlot = item.slot === 45 || item.slot === 53;
    const isNavMaterial =
      item.type === 'minecraft:barrier' || item.type === 'minecraft:arrow';
    const hasRpgTag = Boolean(item.tags && item.tags.rpg_item_id);
    return isCornerNavSlot && isNavMaterial && !hasRpgTag;
  }

  parseSelectedVaultPages(pageParam, pagesParam, maxPage) {
    const allPages = Array.from({ length: maxPage }, (_, i) => i + 1);

    if (pagesParam !== undefined && pagesParam !== null && String(pagesParam).trim() !== '') {
      const raw = String(pagesParam).trim().toLowerCase();
      if (raw === 'all') return allPages;

      const selected = new Set();
      for (const token of raw.split(',')) {
        const part = token.trim();
        if (!part) continue;

        const rangeMatch = part.match(/^(\d+)\s*(?:\.\.|-)\s*(\d+)$/);
        if (rangeMatch) {
          const start = Math.max(1, Math.min(Number(rangeMatch[1]), Number(rangeMatch[2])));
          const end = Math.min(maxPage, Math.max(Number(rangeMatch[1]), Number(rangeMatch[2])));
          for (let p = start; p <= end; p++) selected.add(p);
        } else if (/^\d+$/.test(part)) {
          const num = Number(part);
          if (num >= 1 && num <= maxPage) selected.add(num);
        }
      }
      return [...selected].sort((a, b) => a - b);
    }

    if (pageParam !== undefined && pageParam !== null && String(pageParam).trim() !== '') {
      const num = Number(pageParam);
      if (Number.isInteger(num) && num >= 1 && num <= maxPage) {
        return [num];
      }
      return [];
    }

    return null;
  }

  decodeAllVaultPages(vaultsObj, vaultPagesCount = 1, options = {}) {
    const safeVaults = vaultsObj && typeof vaultsObj === 'object' ? vaultsObj : {};
    const rawKeys = Object.keys(safeVaults);
    const totalUnlocked = Math.max(1, Number(vaultPagesCount) || 1);

    const isZeroBased = rawKeys.includes('0') && !rawKeys.includes('1');
    const numericFromKeys = rawKeys
      .map((k) => Number(k))
      .filter((n) => Number.isInteger(n) && n >= (isZeroBased ? 0 : 1))
      .map((n) => (isZeroBased ? n + 1 : n));

    const maxPage = Math.max(totalUnlocked, ...numericFromKeys);
    const pages = [];

    for (let pageNum = 1; pageNum <= maxPage; pageNum++) {
      const rawKey = String(isZeroBased ? pageNum - 1 : pageNum);
      const rawVal = safeVaults[rawKey];
      const base64Str =
        typeof rawVal === 'string'
          ? rawVal
          : rawVal && typeof rawVal === 'object'
          ? Object.values(rawVal).find((v) => typeof v === 'string' && v.startsWith('rO0ABX'))
          : null;

      const decoded = base64Str ? decodeItemStackBase64(base64Str, options) : [];
      const items = decoded.filter((item) => !this.isVaultNavButton(item));
      const rawCapacity = decoded.capacity || 54;
      const usableCapacity = rawCapacity >= 54 ? 52 : rawCapacity;

      pages.push({
        page: pageNum,
        rawKey,
        capacity: usableCapacity,
        usedSlots: items.length,
        items,
      });
    }

    return pages;
  }

  buildVaultSummary(decodedPages) {
    return {
      totalPages: decodedPages.length,
      totalUsedSlots: decodedPages.reduce((sum, p) => sum + p.usedSlots, 0),
      totalCapacity: decodedPages.reduce((sum, p) => sum + p.capacity, 0),
      pagesOverview: decodedPages.map((p) => ({
        page: p.page,
        usedSlots: p.usedSlots,
        capacity: p.capacity,
      })),
    };
  }

  buildVaultResponse(
    guildDoc,
    viewerUser,
    { page, pages, q, itemPage = 1, itemLimit = 50, includeRaw = false, lang = 'vi' } = {}
  ) {
    if (!this.canViewInternalGuildData(guildDoc, viewerUser)) {
      throw AppError.forbidden('GUILD_VAULT_FORBIDDEN');
    }

    const vaultPagesCount = Number(guildDoc['vault-pages'] || 1);
    const allDecodedPages = this.decodeAllVaultPages(guildDoc.vaults, vaultPagesCount, {
      includeRaw,
      lang,
    });
    const vaultSummary = this.buildVaultSummary(allDecodedPages);

    const hasKeyword = Boolean(q && String(q).trim() !== '');
    const selectedPageNums = this.parseSelectedVaultPages(
      page,
      pages,
      allDecodedPages.length
    );

    const targetPageNums =
      selectedPageNums !== null
        ? selectedPageNums
        : hasKeyword
        ? allDecodedPages.map((p) => p.page)
        : [1];

    const targetSet = new Set(targetPageNums);
    const filteredPages = allDecodedPages.filter((p) => targetSet.has(p.page));

    if (hasKeyword) {
      const keyword = String(q).trim();
      const matchedFlat = [];

      for (const p of filteredPages) {
        for (const item of p.items) {
          if (matchDecodedItem(item, keyword)) {
            matchedFlat.push({
              vaultPage: p.page,
              ...item,
            });
          }
        }
      }

      const safeItemPage = Math.max(1, Number(itemPage) || 1);
      const safeItemLimit = Math.min(100, Math.max(1, Number(itemLimit) || 50));
      const startIdx = (safeItemPage - 1) * safeItemLimit;
      const pagedItems = matchedFlat.slice(startIdx, startIdx + safeItemLimit);

      return {
        guildId: guildDoc._id,
        guildName: guildDoc.name,
        mode: 'SEARCH',
        keyword,
        searchedPages: targetPageNums,
        vaultSummary,
        items: pagedItems,
        pagination: {
          page: safeItemPage,
          limit: safeItemLimit,
          total: matchedFlat.length,
          totalPages: Math.max(1, Math.ceil(matchedFlat.length / safeItemLimit)),
        },
      };
    }

    return {
      guildId: guildDoc._id,
      guildName: guildDoc.name,
      mode: 'PAGES',
      loadedPages: targetPageNums,
      vaultSummary,
      vaults: filteredPages,
    };
  }

  async getMyGuildVault(viewerUser, queryOptions = {}) {
    const guildDoc = await guildRepository.findByMemberUuid(viewerUser.uuid);
    if (!guildDoc) return null;
    return this.buildVaultResponse(guildDoc, viewerUser, queryOptions);
  }

  async getGuildVaultById(guildId, viewerUser, queryOptions = {}) {
    const guildDoc = await guildRepository.findByIdOrName(guildId);
    if (!guildDoc) {
      throw AppError.notFound('GUILD_NOT_FOUND');
    }
    return this.buildVaultResponse(guildDoc, viewerUser, queryOptions);
  }

  async getPlayerGuildBadge(uuid) {
    const guild = await guildRepository.findByMemberUuid(uuid, {
      _id: 1,
      name: 1,
      leader: 1,
      'vice-leaders': 1,
      members: 1,
      level: 1,
    });

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

    const { docs, total } = await guildRepository.findPaginatedLeaderboard({
      q,
      sortBy,
      skip,
      limit: safeLimit,
    });

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

    const vaultPagesCount = Number(guildDoc['vault-pages'] || 1);

    const detail = {
      accessLevel: isInternalAccess ? 'MEMBER' : 'PUBLIC',
      viewerGuildRole,
      id: guildDoc._id,
      name: guildDoc.name,
      level: Number(guildDoc.level || 1),
      exp: Number(guildDoc.exp || 0),
      memberCount: members.length,
      maxMembers: Number(guildDoc['max-members'] || 20),
      vaultPagesCount,
      hasIsland: Boolean(guildDoc['has-island']),
      islandId: Number(guildDoc['island-id'] ?? -1),
      members,
    };

    if (isInternalAccess) {
      const decodedPages = this.decodeAllVaultPages(guildDoc.vaults, vaultPagesCount, options);
      detail.bankBalance = formatCurrency(guildDoc['bank-balance'] || 0);
      detail.vaultSummary = this.buildVaultSummary(decodedPages);
    }

    return detail;
  }

  async getGuildById(guildId, viewerUser = null, options = {}) {
    const guildDoc = await guildRepository.findByIdOrName(guildId);
    if (!guildDoc) {
      throw AppError.notFound('GUILD_NOT_FOUND');
    }

    return this.formatGuildDetail(guildDoc, viewerUser, options);
  }

  async getMyGuild(viewerUser, options = {}) {
    const guildDoc = await guildRepository.findByMemberUuid(viewerUser.uuid);
    if (!guildDoc) return null;
    return this.formatGuildDetail(guildDoc, viewerUser, options);
  }

  async getAllGuildsAdmin({ q = '', page = 1, limit = 10, includeRaw = false, lang = 'vi' } = {}) {
    const safePage = Math.max(1, Number(page) || 1);
    const safeLimit = Math.min(50, Math.max(1, Number(limit) || 10));
    const skip = (safePage - 1) * safeLimit;

    const { docs, total } = await guildRepository.findPaginatedAdmin({
      q,
      skip,
      limit: safeLimit,
    });

    const adminViewer = { uuid: 'SYSTEM_ADMIN', role: 'ADMIN' };
    const guilds = await Promise.all(
      docs.map((doc) => this.formatGuildDetail(doc, adminViewer, { includeRaw, lang }))
    );

    return {
      items: guilds,
      pagination: {
        page: safePage,
        limit: safeLimit,
        total,
        totalPages: Math.max(1, Math.ceil(total / safeLimit)),
      },
    };
  }
}

module.exports = new GuildService();