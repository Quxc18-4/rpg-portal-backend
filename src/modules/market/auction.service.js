const auctionRepository = require('./auction.repository');
const friendService = require('../player/friend.service');
const { formatCurrency } = require('../../utils/currency.util');
const itemDecoder = require('../../utils/itemDecoder.util');
const { AppError } = require('../../utils/error.util');

class AuctionService {
  normalizeTimestamp(rawVal) {
    if (rawVal === undefined || rawVal === null || rawVal === '') return null;

    if (rawVal instanceof Date) {
      const ms = rawVal.getTime();
      return Number.isNaN(ms) ? null : { ms, iso: rawVal.toISOString() };
    }

    if (typeof rawVal === 'number') {
      if (!Number.isFinite(rawVal) || rawVal <= 0) return null;
      // Tự nhận diện epoch giây (< 1e12) vs mili-giây
      const ms = rawVal < 1e12 ? rawVal * 1000 : rawVal;
      return { ms, iso: new Date(ms).toISOString() };
    }

    const parsed = Date.parse(String(rawVal));
    if (!Number.isNaN(parsed)) {
      return { ms: parsed, iso: new Date(parsed).toISOString() };
    }

    return null;
  }

  decodeAuctionItem(doc, options = {}) {
    const base64Str =
      doc.item_base64 || doc.itemBase64 || doc.item || doc.serialized_item || null;

    if (!base64Str || typeof base64Str !== 'string') {
      return null;
    }

    let decodedItem = null;
    if (typeof itemDecoder.decodeSingleItemBase64 === 'function') {
      decodedItem = itemDecoder.decodeSingleItemBase64(base64Str, options);
    }

    if (!decodedItem) {
      const list = itemDecoder.decodeItemStackBase64(base64Str, options);
      decodedItem = Array.isArray(list) && list.length > 0 ? list[0] : null;
    }

    if (!decodedItem) return null;

    // Loại bỏ slot mặc định (0) vì vật phẩm đấu giá đứng độc lập
    const { slot, ...cleanItem } = decodedItem;
    return cleanItem;
  }

  inferItemCategory(doc, decodedItem) {
    if (doc.category) return String(doc.category).toUpperCase();
    const type = String(decodedItem?.type || '').toLowerCase();

    if (/(sword|axe|bow|crossbow|trident|mace|hoe|shears)/.test(type)) return 'WEAPON';
    if (/(helmet|chestplate|leggings|boots|shield|elytra)/.test(type)) return 'ARMOR';
    if (/(pickaxe|shovel|fishing_rod)/.test(type)) return 'TOOL';
    if (/(potion|apple|bread|stew|cooked_|carrot|potato)/.test(type)) return 'CONSUMABLE';
    if (/(book|enchanted_book)/.test(type)) return 'SKILL_BOOK';
    return 'MATERIAL';
  }

  extractParticipants(doc) {
    const sellerUuid =
      doc.seller || doc.seller_uuid || doc.sellerUuid || doc.owner || null;
    const sellerName =
      doc.seller_name || doc.sellerName || doc.owner_name || null;

    const buyerUuid =
      doc.buyer ||
      doc.buyer_uuid ||
      doc.buyerUuid ||
      doc.highest_bidder ||
      doc.highestBidder ||
      null;
    const buyerName =
      doc.buyer_name ||
      doc.buyerName ||
      doc.highest_bidder_name ||
      doc.highestBidderName ||
      null;

    return { sellerUuid, sellerName, buyerUuid, buyerName };
  }

  formatAuctionRecord(doc, source, playerCardMap = new Map(), options = {}) {
    const { sellerUuid, sellerName, buyerUuid, buyerName } = this.extractParticipants(doc);
    const sellerCard = sellerUuid ? playerCardMap.get(sellerUuid) : null;
    const buyerCard = buyerUuid ? playerCardMap.get(buyerUuid) : null;

    const decodedItem = this.decodeAuctionItem(doc, options);
    const category = this.inferItemCategory(doc, decodedItem);

    const rawPrice = Number(
      doc.final_price ?? doc.price ?? doc.buy_now_price ?? doc.current_bid ?? 0
    );
    const rawStartingPrice =
      doc.starting_price !== undefined ? Number(doc.starting_price) : null;
    const rawCurrentBid =
      doc.current_bid !== undefined ? Number(doc.current_bid) : null;

    const created = this.normalizeTimestamp(
      doc.created_at ?? doc.createdAt ?? doc.listed_at ?? doc.start_time
    );
    const expires = this.normalizeTimestamp(
      doc.expires_at ?? doc.expiresAt ?? doc.end_time ?? doc.expire_time
    );
    const sold = this.normalizeTimestamp(
      doc.sold_at ?? doc.soldAt ?? doc.ended_at ?? doc.closed_at
    );

    const now = Date.now();
    const isExpired =
      source === 'ACTIVE' && expires ? expires.ms <= now : source === 'HISTORY' && doc.status === 'EXPIRED';
    const remainingMs =
      source === 'ACTIVE' && expires ? Math.max(0, expires.ms - now) : 0;

    const status = doc.status
      ? String(doc.status).toUpperCase()
      : source === 'ACTIVE'
      ? isExpired
        ? 'EXPIRED'
        : 'ACTIVE'
      : buyerUuid
      ? 'SOLD'
      : 'EXPIRED';

    return {
      id: String(doc._id),
      source,
      status,
      category,
      seller: {
        uuid: sellerUuid,
        username: sellerCard?.username || sellerName || 'Unknown',
        isVip: Boolean(sellerCard?.isVip),
        adventurerRank: sellerCard?.adventurerRank || 'F-',
      },
      buyer: buyerUuid
        ? {
            uuid: buyerUuid,
            username: buyerCard?.username || buyerName || 'Unknown',
            isVip: Boolean(buyerCard?.isVip),
            adventurerRank: buyerCard?.adventurerRank || 'F-',
          }
        : null,
      price: formatCurrency(rawPrice),
      startingPrice: rawStartingPrice !== null ? formatCurrency(rawStartingPrice) : null,
      currentBid: rawCurrentBid !== null ? formatCurrency(rawCurrentBid) : null,
      bidCount: Number(doc.bid_count ?? (Array.isArray(doc.bids) ? doc.bids.length : 0)),
      createdAt: created?.iso || null,
      expiresAt: expires?.iso || null,
      soldAt: sold?.iso || null,
      remainingMs,
      isExpired,
      item: decodedItem,
    };
  }

  async hydrateRecords(docs, source, options = {}) {
    const uuids = [];
    for (const doc of docs) {
      const { sellerUuid, buyerUuid } = this.extractParticipants(doc);
      if (sellerUuid) uuids.push(sellerUuid);
      if (buyerUuid) uuids.push(buyerUuid);
    }

    const cards = await friendService.hydratePlayerCards(uuids);
    const cardMap = new Map(cards.map((c) => [c.uuid, c]));

    return docs.map((doc) => this.formatAuctionRecord(doc, source, cardMap, options));
  }

  matchesKeywordAndCategory(formattedRecord, keyword, category) {
    if (category && String(category).trim() !== '') {
      const targetCat = String(category).trim().toUpperCase();
      if (targetCat !== 'ALL' && formattedRecord.category !== targetCat) {
        return false;
      }
    }

    if (keyword && String(keyword).trim() !== '') {
      const kw = String(keyword).trim().toLowerCase();
      const sellerMatch = String(formattedRecord.seller?.username || '')
        .toLowerCase()
        .includes(kw);
      const buyerMatch = String(formattedRecord.buyer?.username || '')
        .toLowerCase()
        .includes(kw);
      const itemMatch = formattedRecord.item
        ? itemDecoder.matchDecodedItem(formattedRecord.item, keyword)
        : false;

      if (!sellerMatch && !buyerMatch && !itemMatch) {
        return false;
      }
    }

    return true;
  }

  /**
   * Danh sách vật phẩm đang treo bán trên Chợ Đấu Giá (GET /api/v1/market/auctions)
   */
  async getActiveAuctions(query = {}, viewerUser = null, options = {}) {
    const {
      mine,
      sellerUuid,
      q = '',
      category = '',
      minPrice,
      maxPrice,
      sortBy = 'newest',
      page = 1,
      limit = 20,
    } = query;

    const safePage = Math.max(1, Number(page) || 1);
    const safeLimit = Math.min(50, Math.max(1, Number(limit) || 20));
    const andConditions = [];

    if (String(mine) === 'true') {
      if (!viewerUser || !viewerUser.uuid) {
        throw AppError.unauthorized('MARKET_MINE_AUTH_REQUIRED');
      }
      andConditions.push(auctionRepository.buildSellerFilter(viewerUser.uuid));
    } else if (sellerUuid && String(sellerUuid).trim() !== '') {
      andConditions.push(auctionRepository.buildSellerFilter(String(sellerUuid).trim()));
    }

    const priceFilter = auctionRepository.buildPriceFilter(minPrice, maxPrice);
    if (priceFilter) {
      andConditions.push(priceFilter);
    }

    const filter = andConditions.length > 0 ? { $and: andConditions } : {};
    const sort = auctionRepository.resolveSort(sortBy, false);

    const needsInMemoryFilter =
      (q && String(q).trim() !== '') ||
      (category && String(category).trim() !== '' && String(category).toUpperCase() !== 'ALL');

    if (needsInMemoryFilter) {
      const rawDocs = await auctionRepository.findAllActiveMatching({ filter, sort, maxScan: 500 });
      const hydrated = await this.hydrateRecords(rawDocs, 'ACTIVE', options);
      const filtered = hydrated.filter((rec) =>
        this.matchesKeywordAndCategory(rec, q, category)
      );

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
    const { docs, total } = await auctionRepository.findActive({
      filter,
      sort,
      skip,
      limit: safeLimit,
    });
    const items = await this.hydrateRecords(docs, 'ACTIVE', options);

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
   * Lịch sử Chợ Đấu Giá (GET /api/v1/market/auctions/history)
   */
  async getAuctionHistory(query = {}, viewerUser = null, options = {}) {
    const {
      mine,
      role = 'all',
      status = '',
      q = '',
      category = '',
      sortBy = 'newest',
      page = 1,
      limit = 20,
    } = query;

    const safePage = Math.max(1, Number(page) || 1);
    const safeLimit = Math.min(50, Math.max(1, Number(limit) || 20));
    const andConditions = [];

    if (String(mine) === 'true') {
      if (!viewerUser || !viewerUser.uuid) {
        throw AppError.unauthorized('MARKET_MINE_AUTH_REQUIRED');
      }
      andConditions.push(
        auctionRepository.buildParticipantFilter(viewerUser.uuid, String(role).toLowerCase())
      );
    }

    if (status && String(status).trim() !== '' && String(status).toUpperCase() !== 'ALL') {
      andConditions.push({
        status: new RegExp(`^${String(status).trim()}$`, 'i'),
      });
    }

    const filter = andConditions.length > 0 ? { $and: andConditions } : {};
    const sort = auctionRepository.resolveSort(sortBy, true);

    const needsInMemoryFilter =
      (q && String(q).trim() !== '') ||
      (category && String(category).trim() !== '' && String(category).toUpperCase() !== 'ALL');

    if (needsInMemoryFilter) {
      const rawDocs = await auctionRepository.findAllHistoryMatching({
        filter,
        sort,
        maxScan: 500,
      });
      const hydrated = await this.hydrateRecords(rawDocs, 'HISTORY', options);
      const filtered = hydrated.filter((rec) =>
        this.matchesKeywordAndCategory(rec, q, category)
      );

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
    const { docs, total } = await auctionRepository.findHistory({
      filter,
      sort,
      skip,
      limit: safeLimit,
    });
    const items = await this.hydrateRecords(docs, 'HISTORY', options);

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
   * Chi tiết 1 phiên đấu giá (tìm trong active trước, không thấy thì tìm trong history)
   */
  async getAuctionById(auctionId, options = {}) {
    const found = await auctionRepository.findById(auctionId);
    if (!found) {
      throw AppError.notFound('MARKET_AUCTION_NOT_FOUND');
    }

    const [hydrated] = await this.hydrateRecords([found.doc], found.source, options);
    return hydrated;
  }
}

module.exports = new AuctionService();