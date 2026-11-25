const mongoose = require('mongoose');

const ADVENTURER_RANKS = [
  { rank: 'S+', minRep: 220000 },
  { rank: 'S', minRep: 160000 },
  { rank: 'S-', minRep: 115000 },
  { rank: 'A+', minRep: 82000 },
  { rank: 'A', minRep: 58000 },
  { rank: 'A-', minRep: 40000 },
  { rank: 'B+', minRep: 27000 },
  { rank: 'B', minRep: 18000 },
  { rank: 'B-', minRep: 12000 },
  { rank: 'C+', minRep: 8000 },
  { rank: 'C', minRep: 5500 },
  { rank: 'C-', minRep: 3800 },
  { rank: 'D+', minRep: 2600 },
  { rank: 'D', minRep: 1800 },
  { rank: 'D-', minRep: 1200 },
  { rank: 'E+', minRep: 800 },
  { rank: 'E', minRep: 500 },
  { rank: 'E-', minRep: 300 },
  { rank: 'F+', minRep: 150 },
  { rank: 'F', minRep: 50 },
  { rank: 'F-', minRep: 0 },
];

function computeAdventurerRank(reputation = 0, maxReputation = 0) {
  const rep = Number(reputation || 0);
  const maxRep = Number(maxReputation || 0);
  const effectiveRep = Math.max(rep, maxRep);

  let currentIdx = ADVENTURER_RANKS.length - 1;
  for (let i = 0; i < ADVENTURER_RANKS.length; i++) {
    if (effectiveRep >= ADVENTURER_RANKS[i].minRep) {
      currentIdx = i;
      break;
    }
  }

  const currentTier = ADVENTURER_RANKS[currentIdx];
  const nextTier = currentIdx > 0 ? ADVENTURER_RANKS[currentIdx - 1] : null;

  const remainingToNextRank = nextTier ? Math.max(0, nextTier.minRep - effectiveRep) : 0;
  const progressPercent = nextTier
    ? Math.min(
        100,
        Math.max(
          0,
          Math.round(((effectiveRep - currentTier.minRep) / (nextTier.minRep - currentTier.minRep)) * 100)
        )
      )
    : 100;

  return {
    rank: currentTier.rank,
    reputation: rep,
    maxReputation: maxRep,
    effectiveReputation: effectiveRep,
    usableReputation: Math.max(0, rep - 1200),
    nextRank: nextTier ? nextTier.rank : null,
    nextRankMinRep: nextTier ? nextTier.minRep : null,
    remainingToNextRank,
    progressPercent,
  };
}

class QuestService {
  getCollection() {
    return mongoose.connection.db.collection('player_quests');
  }

  async getRankSummaryByUuid(uuid) {
    const doc = await this.getCollection().findOne(
      { uuid },
      { projection: { reputation: 1, max_reputation: 1 } }
    );
    return computeAdventurerRank(doc?.reputation || 0, doc?.max_reputation || 0);
  }

  async getRankSummaryMap(uuids = []) {
    if (!Array.isArray(uuids) || uuids.length === 0) return new Map();

    const docs = await this.getCollection()
      .find(
        { uuid: { $in: uuids } },
        { projection: { uuid: 1, reputation: 1, max_reputation: 1 } }
      )
      .toArray();

    const map = new Map();
    for (const doc of docs) {
      map.set(doc.uuid, computeAdventurerRank(doc.reputation || 0, doc.max_reputation || 0));
    }
    return map;
  }

  async getPlayerQuests(uuid) {
    const doc = await this.getCollection().findOne({ uuid });
    const rankInfo = computeAdventurerRank(doc?.reputation || 0, doc?.max_reputation || 0);

    const activeQuestsObj =
      doc?.active_quests && typeof doc.active_quests === 'object' ? doc.active_quests : {};
    const activeBountiesObj =
      doc?.active_bounties && typeof doc.active_bounties === 'object' ? doc.active_bounties : {};
    const pendingBountyRewardsObj =
      doc?.pending_bounty_rewards && typeof doc.pending_bounty_rewards === 'object'
        ? doc.pending_bounty_rewards
        : {};

    return {
      uuid,
      adventurerRank: rankInfo,
      daily: {
        completed: Number(doc?.daily_completed || 0),
        claimed: Number(doc?.daily_claimed || 0),
        lastResetDay: Number(doc?.last_daily_reset || 0),
      },
      weekly: {
        points: Number(doc?.weekly_points || 0),
        guildPoints: Number(doc?.weekly_guild_points || 0),
        claimedBonus: Boolean(doc?.claimed_weekly_bonus),
        lastResetWeek: Number(doc?.last_weekly_reset || 0),
      },
      activeQuests: activeQuestsObj,
      pinnedQuests: Array.isArray(doc?.pinned_quests) ? doc.pinned_quests : [],
      completedDynamicQuests: Array.isArray(doc?.completed_dynamic_quests)
        ? doc.completed_dynamic_quests
        : [],
      completedStoryQuests: Array.isArray(doc?.completed_story_quests)
        ? doc.completed_story_quests
        : [],
      canceledDynamicQuests: Array.isArray(doc?.canceled_dynamic_quests)
        ? doc.canceled_dynamic_quests
        : [],
      activeBounties: activeBountiesObj,
      pendingBountyRewards: pendingBountyRewardsObj,
    };
  }
}

const questService = new QuestService();
questService.computeAdventurerRank = computeAdventurerRank;

module.exports = questService;