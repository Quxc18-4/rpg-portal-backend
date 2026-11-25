const mongoose = require('mongoose');
const PlayerAccount = require('../../models/PlayerAccount.model');
const questService = require('./quest.service');

class FriendService {
  getCollection() {
    return mongoose.connection.db.collection('friends');
  }

  async areFriends(ownerUuid, viewerUuid) {
    if (!ownerUuid || !viewerUuid || ownerUuid === viewerUuid) return false;
    const doc = await this.getCollection().findOne(
      { _id: ownerUuid, friends: viewerUuid },
      { projection: { _id: 1 } }
    );
    return Boolean(doc);
  }

  async hydratePlayerCards(uuids = []) {
    const uniqueUuids = [...new Set(uuids.filter(Boolean))];
    if (uniqueUuids.length === 0) return [];

    const db = mongoose.connection.db;
    const [playerDocs, accountDocs, rankMap] = await Promise.all([
      db
        .collection('players')
        .find(
          { _id: { $in: uniqueUuids } },
          { projection: { _id: 1, username: 1, active_slot: 1, slots: 1, class: 1, level: 1 } }
        )
        .toArray(),
      db
        .collection('player_accounts')
        .find(
          { _id: { $in: uniqueUuids } },
          { projection: { _id: 1, playerName: 1, is_vip: 1, vip_expires_at: 1 } }
        )
        .toArray(),
      questService.getRankSummaryMap(uniqueUuids),
    ]);

    const playerMap = new Map(playerDocs.map((p) => [p._id, p]));
    const accountMap = new Map(accountDocs.map((a) => [a._id, a]));

    return uniqueUuids.map((uuid) => {
      const p = playerMap.get(uuid);
      const acc = accountMap.get(uuid);
      const vipState = PlayerAccount.resolveAccountVipState(acc);
      const activeSlot = Math.max(1, Number(p?.active_slot || 1));
      const slotData = p?.slots?.[String(activeSlot)] || p || {};
      const rankSummary = rankMap.get(uuid) || questService.computeAdventurerRank(0, 0);

      return {
        uuid,
        username: p?.username || acc?.playerName || 'Unknown',
        isVip: vipState.isVip,
        activeSlot,
        class: slotData.class || 'commoner',
        level: Number(slotData.level || 1),
        adventurerRank: rankSummary.rank,
        reputation: rankSummary.reputation,
      };
    });
  }

  async getMyFriends(uuid) {
    const doc = await this.getCollection().findOne({ _id: uuid });
    const friendUuids = Array.isArray(doc?.friends) ? doc.friends : [];
    const pendingUuids = Array.isArray(doc?.pending_requests) ? doc.pending_requests : [];

    const [friends, pendingRequests] = await Promise.all([
      this.hydratePlayerCards(friendUuids),
      this.hydratePlayerCards(pendingUuids),
    ]);

    return {
      totalFriends: friends.length,
      totalPendingRequests: pendingRequests.length,
      friends,
      pendingRequests,
    };
  }
}

module.exports = new FriendService();