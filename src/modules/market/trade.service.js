const tradeRepository = require('./trade.repository');
const friendService = require('../player/friend.service');
const { formatCurrency } = require('../../utils/currency.util');
const itemDecoder = require('../../utils/itemDecoder.util');
const { AppError } = require('../../utils/error.util');

class TradeService {
  isStaff(user) {
    return Boolean(user && (user.role === 'ADMIN' || user.role === 'MODERATOR'));
  }

  toNumericValue(rawVal) {
    if (rawVal === undefined || rawVal === null || rawVal === '') return null;
    if (typeof rawVal === 'number') return Number.isFinite(rawVal) ? rawVal : null;
    if (typeof rawVal === 'object' && typeof rawVal.toNumber === 'function') {
      return rawVal.toNumber();
    }
    const parsed = Number(rawVal);
    return Number.isFinite(parsed) ? parsed : null;
  }

  normalizeTimestamp(rawVal) {
    if (rawVal === undefined || rawVal === null || rawVal === '') return null;
    if (rawVal instanceof Date) {
      const ms = rawVal.getTime();
      return Number.isNaN(ms) ? null : { ms, iso: rawVal.toISOString() };
    }
    const numeric = this.toNumericValue(rawVal);
    if (numeric !== null && numeric > 0) {
      const ms = numeric < 1e12 ? numeric * 1000 : numeric;
      return { ms, iso: new Date(ms).toISOString() };
    }
    const parsed = Date.parse(String(rawVal));
    return Number.isNaN(parsed) ? null : { ms: parsed, iso: new Date(parsed).toISOString() };
  }

  summarizeTradedCurrency(decodedItems) {
    let totalCopper = 0;

    for (const item of decodedItems) {
      const currencyType = String(item?.tags?.rpg_currency_type || '').toLowerCase();
      const amount = Number(item?.amount || 0);
      if (!currencyType || amount <= 0) continue;

      if (currencyType === 'gold') {
        totalCopper += amount * 4096;
      } else if (currencyType === 'silver' || currencyType === 'iron') {
        totalCopper += amount * 64;
      } else if (currencyType === 'copper') {
        totalCopper += amount;
      }
    }

    return totalCopper > 0 ? formatCurrency(totalCopper) : null;
  }

  decodeTradeItems(base64Str, options = {}) {
    if (!base64Str || typeof base64Str !== 'string') return [];
    const decoded = itemDecoder.decodeItemStackBase64(base64Str, options);
    return Array.isArray(decoded) ? decoded : [];
  }

  formatTradeRecord(doc, playerCardMap = new Map(), viewerUser = null, options = {}) {
    const p1Uuid = doc.player1 || null;
    const p2Uuid = doc.player2 || null;

    const p1Card = p1Uuid ? playerCardMap.get(p1Uuid) : null;
    const p2Card = p2Uuid ? playerCardMap.get(p2Uuid) : null;

    const items1 = this.decodeTradeItems(doc.items1_base64, options);
    const items2 = this.decodeTradeItems(doc.items2_base64, options);

    const side1 = {
      player: {
        uuid: p1Uuid,
        username: p1Card?.username || 'Unknown',
        isVip: Boolean(p1Card?.isVip),
        adventurerRank: p1Card?.adventurerRank || 'F-',
      },
      itemCount: items1.length,
      currency: this.summarizeTradedCurrency(items1),
      items: items1,
    };

    const side2 = {
      player: {
        uuid: p2Uuid,
        username: p2Card?.username || 'Unknown',
        isVip: Boolean(p2Card?.isVip),
        adventurerRank: p2Card?.adventurerRank || 'F-',
      },
      itemCount: items2.length,
      currency: this.summarizeTradedCurrency(items2),
      items: items2,
    };

    const ts = this.normalizeTimestamp(doc.timestamp);

    let perspective = null;
    if (viewerUser?.uuid && (viewerUser.uuid === p1Uuid || viewerUser.uuid === p2Uuid)) {
      const isPlayer1 = viewerUser.uuid === p1Uuid;
      const mySide = isPlayer1 ? side1 : side2;
      const partnerSide = isPlayer1 ? side2 : side1;

      perspective = {
        partner: partnerSide.player,
        offered: {
          itemCount: mySide.itemCount,
          currency: mySide.currency,
          items: mySide.items,
        },
        received: {
          itemCount: partnerSide.itemCount,
          currency: partnerSide.currency,
          items: partnerSide.items,
        },
      };
    }

    return {
      id: doc.trade_id || String(doc._id),
      mongoId: String(doc._id),
      tradedAt: ts?.iso || null,
      side1,
      side2,
      perspective,
    };
  }

  async hydrateTrades(docs, viewerUser = null, options = {}) {
    const uuids = [];
    for (const doc of docs) {
      if (doc.player1) uuids.push(doc.player1);
      if (doc.player2) uuids.push(doc.player2);
    }

    const cards = await friendService.hydratePlayerCards(uuids);
    const cardMap = new Map(cards.map((c) => [c.uuid, c]));

    return docs.map((doc) =>
      this.formatTradeRecord(doc, cardMap, viewerUser, options)
    );
  }

  matchesItemKeyword(item, kw) {
    if (!item || typeof item !== 'object') return false;

    if (String(item.displayName || '').toLowerCase().includes(kw)) return true;
    if (String(item.type || '').toLowerCase().includes(kw)) return true;

    if (Array.isArray(item.lore)) {
      const loreMatch = item.lore.some((line) =>
        String(line || '').toLowerCase().includes(kw)
      );
      if (loreMatch) return true;
    }

    if (item.tags && typeof item.tags === 'object') {
      const tagMatch = Object.values(item.tags).some((val) =>
        String(val || '').toLowerCase().includes(kw)
      );
      if (tagMatch) return true;
    }

    return false;
  }

  matchesKeyword(formattedTrade, keyword) {
    if (!keyword || String(keyword).trim() === '') return true;
    const kw = String(keyword).trim().toLowerCase();

    const p1Match = String(formattedTrade.side1.player.username || '')
      .toLowerCase()
      .includes(kw);
    const p2Match = String(formattedTrade.side2.player.username || '')
      .toLowerCase()
      .includes(kw);
    if (p1Match || p2Match) return true;

    const item1Match = formattedTrade.side1.items.some((item) =>
      this.matchesItemKeyword(item, kw)
    );
    if (item1Match) return true;

    return formattedTrade.side2.items.some((item) =>
      this.matchesItemKeyword(item, kw)
    );
  }

  async getTrades(query = {}, viewerUser, options = {}, { forceMine = false } = {}) {
    const {
      player,
      partner,
      q = '',
      sortBy = 'newest',
      page = 1,
      limit = 20,
    } = query;

    const safePage = Math.max(1, Number(page) || 1);
    const safeLimit = Math.min(50, Math.max(1, Number(limit) || 20));
    const staff = this.isStaff(viewerUser);

    let filter = {};
    if (forceMine || !staff) {
      const myUuid = viewerUser.uuid;
      if (partner && String(partner).trim() !== '') {
        filter = tradeRepository.buildPairFilter(myUuid, String(partner).trim());
      } else {
        filter = tradeRepository.buildPlayerFilter(myUuid);
      }
    } else {
      const cleanPlayer = player ? String(player).trim() : '';
      const cleanPartner = partner ? String(partner).trim() : '';
      if (cleanPlayer && cleanPartner) {
        filter = tradeRepository.buildPairFilter(cleanPlayer, cleanPartner);
      } else if (cleanPlayer) {
        filter = tradeRepository.buildPlayerFilter(cleanPlayer);
      } else if (cleanPartner) {
        filter = tradeRepository.buildPlayerFilter(cleanPartner);
      }
    }

    const sort = tradeRepository.resolveSort(sortBy);
    const hasKeyword = Boolean(q && String(q).trim() !== '');

    if (hasKeyword) {
      const rawDocs = await tradeRepository.findAllMatching({ filter, sort, maxScan: 500 });
      const hydrated = await this.hydrateTrades(rawDocs, viewerUser, options);
      const filtered = hydrated.filter((tr) => this.matchesKeyword(tr, q));

      const start = (safePage - 1) * safeLimit;
      const items = filtered.slice(start, start + safeLimit);

      return {
        items,
        pagination: {
          page: safePage,
          limit: safeLimit,
          total: filtered.length,
          totalPages: Math.max(1, Math.ceil(filtered.length / safeLimit)),
        },
      };
    }

    const skip = (safePage - 1) * safeLimit;
    const { docs, total } = await tradeRepository.findPaginated({
      filter,
      sort,
      skip,
      limit: safeLimit,
    });
    const items = await this.hydrateTrades(docs, viewerUser, options);

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

  async getTradeById(tradeId, viewerUser, options = {}) {
    const doc = await tradeRepository.findById(tradeId);
    if (!doc) {
      throw AppError.notFound('MARKET_TRADE_NOT_FOUND');
    }

    const isParticipant =
      viewerUser?.uuid &&
      (viewerUser.uuid === doc.player1 || viewerUser.uuid === doc.player2);

    if (!isParticipant && !this.isStaff(viewerUser)) {
      throw AppError.forbidden('MARKET_TRADE_FORBIDDEN');
    }

    const [hydrated] = await this.hydrateTrades([doc], viewerUser, options);
    return hydrated;
  }
}

module.exports = new TradeService();