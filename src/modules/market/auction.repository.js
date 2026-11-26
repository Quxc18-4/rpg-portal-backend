const mongoose = require('mongoose');
const { ObjectId } = mongoose.Types;

class AuctionRepository {
  getActiveCollection() {
    return mongoose.connection.db.collection('auction_active');
  }

  getHistoryCollection() {
    return mongoose.connection.db.collection('auction_history');
  }

  buildIdFilter(id) {
    const cleanId = String(id || '').trim();
    const orConditions = [{ _id: cleanId }, { auction_id: cleanId }, { auctionId: cleanId }];
    if (ObjectId.isValid(cleanId) && String(new ObjectId(cleanId)) === cleanId) {
      orConditions.push({ _id: new ObjectId(cleanId) });
    }
    return { $or: orConditions };
  }

  buildSellerFilter(sellerUuid) {
    return {
      $or: [
        { seller_id: sellerUuid },
        { seller: sellerUuid },
        { seller_uuid: sellerUuid },
        { sellerUuid: sellerUuid },
        { owner: sellerUuid },
      ],
    };
  }

  buildBuyerFilter(buyerUuid) {
    return {
      $or: [
        { buyer_id: buyerUuid },
        { buyer: buyerUuid },
        { buyer_uuid: buyerUuid },
        { buyerUuid: buyerUuid },
        { highest_bidder: buyerUuid },
        { highestBidder: buyerUuid },
      ],
    };
  }

  buildParticipantFilter(uuid, role = 'all') {
    if (role === 'seller') return this.buildSellerFilter(uuid);
    if (role === 'buyer') return this.buildBuyerFilter(uuid);
    return {
      $or: [
        ...this.buildSellerFilter(uuid).$or,
        ...this.buildBuyerFilter(uuid).$or,
      ],
    };
  }

  buildPriceFilter(minPrice, maxPrice) {
    const range = {};
    if (minPrice !== undefined && minPrice !== null && minPrice !== '' && !Number.isNaN(Number(minPrice))) {
      range.$gte = Number(minPrice);
    }
    if (maxPrice !== undefined && maxPrice !== null && maxPrice !== '' && !Number.isNaN(Number(maxPrice))) {
      range.$lte = Number(maxPrice);
    }
    if (Object.keys(range).length === 0) return null;

    return {
      $or: [
        { price: range },
        { final_price: range },
        { buy_now_price: range },
      ],
    };
  }

  resolveSort(sortBy = 'newest', isHistory = false) {
    switch (sortBy) {
      case 'price_asc':
        return { price: 1, final_price: 1, _id: -1 };
      case 'price_desc':
        return { price: -1, final_price: -1, _id: -1 };
      case 'next_tax':
      case 'ending_soon':
        return isHistory
          ? { sold_time: -1, list_time: -1, _id: -1 }
          : { next_tax_time: 1, expires_at: 1, _id: -1 };
      case 'newest':
      default:
        return isHistory
          ? { sold_time: -1, list_time: -1, _id: -1 }
          : { list_time: -1, created_at: -1, _id: -1 };
    }
  }

  async findActive({ filter = {}, sort = { list_time: -1, _id: -1 }, skip = 0, limit = 20 } = {}) {
    const col = this.getActiveCollection();
    const [docs, total] = await Promise.all([
      col.find(filter).sort(sort).skip(skip).limit(limit).toArray(),
      col.countDocuments(filter),
    ]);
    return { docs, total };
  }

  async findAllActiveMatching({ filter = {}, sort = { list_time: -1, _id: -1 }, maxScan = 500 } = {}) {
    return this.getActiveCollection().find(filter).sort(sort).limit(maxScan).toArray();
  }

  async findHistory({ filter = {}, sort = { sold_time: -1, _id: -1 }, skip = 0, limit = 20 } = {}) {
    const col = this.getHistoryCollection();
    const [docs, total] = await Promise.all([
      col.find(filter).sort(sort).skip(skip).limit(limit).toArray(),
      col.countDocuments(filter),
    ]);
    return { docs, total };
  }

  async findAllHistoryMatching({ filter = {}, sort = { sold_time: -1, _id: -1 }, maxScan = 500 } = {}) {
    return this.getHistoryCollection().find(filter).sort(sort).limit(maxScan).toArray();
  }

  async findById(id) {
    const idFilter = this.buildIdFilter(id);
    const activeDoc = await this.getActiveCollection().findOne(idFilter);
    if (activeDoc) {
      return { doc: activeDoc, source: 'ACTIVE' };
    }

    const historyDoc = await this.getHistoryCollection().findOne(idFilter);
    if (historyDoc) {
      return { doc: historyDoc, source: 'HISTORY' };
    }

    return null;
  }
}

module.exports = new AuctionRepository();