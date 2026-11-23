const mongoose = require('mongoose');
const { ObjectId } = require('mongodb');

class LicenseBetRepository {
  getBetsCollection() {
    return mongoose.connection.db.collection('license_bets');
  }

  getHistoryCollection() {
    return mongoose.connection.db.collection('license_history');
  }

  getActionsCollection() {
    return mongoose.connection.db.collection('web_operator_actions');
  }

  async ensureIndexes() {
    const betsCol = this.getBetsCollection();
    const historyCol = this.getHistoryCollection();

    await Promise.all([
      betsCol.createIndex({ itemId: 1, status: 1 }),
      betsCol.createIndex({ bettorUuid: 1, createdAt: -1 }),
      betsCol.createIndex({ status: 1, createdAt: 1 }),
      historyCol.createIndex({ settled: 1, completed_at: 1 }),
    ]);
  }

  async createBetWithDebitAction(betData, { targetUsername, reason }) {
    const betDoc = {
      ...betData,
      status: 'PENDING_DEBIT',
      payoutAmount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const insertResult = await this.getBetsCollection().insertOne(betDoc);
    const betId = String(insertResult.insertedId);

    await this.getActionsCollection().insertOne({
      action: 'LICENSE_BET_DEBIT',
      targetUsername,
      reason: reason || `License Bet Debit (${betData.itemId})`,
      payload: {
        betId,
        targetUuid: betData.bettorUuid,
        amount: betData.amount,
        itemId: betData.itemId,
      },
      status: 'PENDING',
      createdAt: new Date(),
    });

    return { _id: insertResult.insertedId, ...betDoc };
  }

  async enqueuePayoutActions(payoutItems = []) {
    if (!payoutItems.length) return;
    const docs = payoutItems.map((item) => ({
      action: 'LICENSE_BET_PAYOUT',
      targetUsername: item.targetUsername,
      reason: item.reason || `License Bet Payout (${item.itemId})`,
      payload: {
        betId: item.betId,
        targetUuid: item.targetUuid,
        amount: item.amount,
        itemId: item.itemId,
        message: item.message,
      },
      status: 'PENDING',
      createdAt: new Date(),
    }));
    await this.getActionsCollection().insertMany(docs);
  }

  async getConfirmedPoolBreakdown(itemId) {
    const rows = await this.getBetsCollection()
      .aggregate([
        { $match: { itemId, status: 'CONFIRMED' } },
        {
          $group: {
            _id: '$candidateUuid',
            totalAmount: { $sum: '$amount' },
            ticketCount: { $sum: 1 },
          },
        },
      ])
      .toArray();

    let totalPool = 0;
    const byCandidate = new Map();
    for (const row of rows) {
      totalPool += row.totalAmount;
      byCandidate.set(row._id, {
        totalAmount: row.totalAmount,
        ticketCount: row.ticketCount,
      });
    }

    return { totalPool, byCandidate };
  }

  async findConfirmedBetsByItem(itemId) {
    return this.getBetsCollection()
      .find({ itemId, status: 'CONFIRMED' })
      .toArray();
  }

  async findBetsByBettor(bettorUuid, { page = 1, limit = 20 } = {}) {
    const col = this.getBetsCollection();
    const skip = (page - 1) * limit;
    const [items, totalItems] = await Promise.all([
      col.find({ bettorUuid }).sort({ createdAt: -1 }).skip(skip).limit(limit).toArray(),
      col.countDocuments({ bettorUuid }),
    ]);
    return { items, totalItems };
  }

  async markBetSettled(betId, { status, payoutAmount = 0, winnerUuid = null, winnerName = null }) {
    return this.getBetsCollection().updateOne(
      { _id: new ObjectId(String(betId)) },
      {
        $set: {
          status,
          payoutAmount,
          winnerUuid,
          winnerName,
          settledAt: new Date(),
          updatedAt: new Date(),
        },
      }
    );
  }

  async findUnsettledHistories() {
    return this.getHistoryCollection()
      .find({ settled: false })
      .sort({ completed_at: 1 })
      .toArray();
  }

  async hasUnsettledHistoryForItem(itemId) {
    const count = await this.getHistoryCollection().countDocuments({
      item_id: itemId,
      settled: false,
    });
    return count > 0;
  }

  async markHistorySettled(historyId) {
    return this.getHistoryCollection().updateOne(
      { _id: new ObjectId(String(historyId)) },
      { $set: { settled: true, settledAt: new Date() } }
    );
  }

  async findAllBetsAdmin({ status, itemId, page = 1, limit = 20 } = {}) {
    const col = this.getBetsCollection();
    const filter = {};
    if (status) filter.status = status;
    if (itemId) filter.itemId = itemId;

    const skip = (page - 1) * limit;
    const [items, totalItems] = await Promise.all([
      col.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).toArray(),
      col.countDocuments(filter),
    ]);
    return { items, totalItems };
  }

  async hasPendingDebitBet(bettorUuid) {
    const count = await this.getBetsCollection().countDocuments({
      bettorUuid,
      status: 'PENDING_DEBIT',
    });
    return count > 0;
  }
}

module.exports = new LicenseBetRepository();