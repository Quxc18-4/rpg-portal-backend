const mongoose = require('mongoose');

class RewardRepository {
  async resolveCollectionName(candidates) {
    const cols = await mongoose.connection.db.listCollections().toArray();
    const names = new Set(cols.map((c) => c.name));
    for (const name of candidates) {
      if (names.has(name)) return name;
    }
    return candidates[0];
  }

  async getAllRewardTemplates() {
    return mongoose.connection.db.collection('reward_templates').find({}).toArray();
  }

  async getPlayerRewardDoc(uuid) {
    return mongoose.connection.db.collection('player_rewards').findOne({ _id: uuid });
  }

  async getAllPlayerRewardDocs() {
    return mongoose.connection.db.collection('player_rewards').find({}).toArray();
  }

  async getPlayerQuestProfile(uuid) {
    const colName = await this.resolveCollectionName([
      'player_quests',
      'quest_profiles',
      'rpg_quests',
    ]);
    return mongoose.connection.db
      .collection(colName)
      .findOne({ $or: [{ uuid }, { _id: uuid }] });
  }

  async getAllQuestProfilesWithPendingBounties() {
    const colName = await this.resolveCollectionName([
      'player_quests',
      'quest_profiles',
      'rpg_quests',
    ]);
    return mongoose.connection.db
      .collection(colName)
      .find({
        pending_bounty_rewards: { $exists: true, $ne: {} },
      })
      .toArray();
  }
}

module.exports = new RewardRepository();