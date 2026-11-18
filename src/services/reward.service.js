const rewardRepo = require('../repositories/reward.repository');
const operatorRepo = require('../repositories/operator.repository');
const { formatCurrency } = require('../utils/currency.util');
const { decodeItemStackBase64 } = require('../utils/itemDecoder.util');

const getVietnamDateString = (timestampMs) => {
  if (!timestampMs || Number(timestampMs) <= 0) return null;
  return new Date(Number(timestampMs)).toLocaleDateString('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
  });
};

class RewardService {
  parseBountyRewardMap(pendingMap = {}) {
    if (!pendingMap || typeof pendingMap !== 'object') return [];

    return Object.entries(pendingMap).map(([bountyId, rawStr]) => {
      // Định dạng từ BountyCheckTask.java: finalPlayerMoney:finalPlayerRep:itemDrop:amount:zoneName
      const parts = String(rawStr || '').split(':');
      const rawCoins = Number(parts[0] || 0);
      const reputation = Number(parts[1] || 0);
      const itemId = parts[2] && parts[2] !== 'NONE' ? parts[2] : null;
      const itemAmount = Number(parts[3] || 0);
      const zoneName = parts.slice(4).join(':') || bountyId;

      return {
        bountyId,
        zoneName,
        rawCoins,
        coins: formatCurrency(rawCoins),
        reputation,
        itemReward: itemId ? { itemId, amount: itemAmount } : null,
      };
    });
  }

  async getPlayerRewards(uuid, options = {}) {
    const [templates, rewardDoc, questDoc] = await Promise.all([
      rewardRepo.getAllRewardTemplates(),
      rewardRepo.getPlayerRewardDoc(uuid),
      rewardRepo.getPlayerQuestProfile(uuid),
    ]);

    const now = Date.now();
    const claimedKitsMap = rewardDoc?.kits || {};

    // 1. Danh sách Kits & thời gian hồi (cooldown)
    const kits = [];
    const monthlyMap = new Map();

    for (const tpl of templates) {
      const id = String(tpl._id || '');
      if (id.startsWith('kit_')) {
        const kitName = id.replace('kit_', '');
        const cooldownSeconds = Number(tpl.cooldown ?? 21600);
        const cooldownMs = cooldownSeconds * 1000;
        const lastClaimedAt = Number(claimedKitsMap[kitName] || 0);
        const nextAvailableAt = lastClaimedAt > 0 ? lastClaimedAt + cooldownMs : now;
        const remainingMs = Math.max(0, nextAvailableAt - now);

        kits.push({
          kitName,
          cooldownSeconds,
          lastClaimedAt,
          nextAvailableAt,
          remainingMs,
          canClaim: remainingMs === 0,
          items: decodeItemStackBase64(tpl.items, options),
        });
      } else if (id.startsWith('monthly_')) {
        const day = Number(id.replace('monthly_', ''));
        if (!Number.isNaN(day)) {
          monthlyMap.set(day, decodeItemStackBase64(tpl.items, options));
        }
      }
    }

    kits.sort((a, b) => a.kitName.localeCompare(b.kitName));

    // 2. Điểm danh hàng ngày (1..31 theo lịch Asia/Ho_Chi_Minh)
    const monthlyProgress = Number(rewardDoc?.monthly_progress ?? 0);
    const monthlyLastClaim = Number(rewardDoc?.monthly_last_claim ?? 0);
    const todayVN = getVietnamDateString(now);
    const lastClaimDateVN = getVietnamDateString(monthlyLastClaim);
    const canClaimToday = monthlyLastClaim === 0 || lastClaimDateVN !== todayVN;
    const nextDayToClaim = monthlyProgress >= 31 ? 1 : monthlyProgress + 1;

    // 3. Quà Bounty Clear Zone đang chờ nhận tại Tiếp Tân Bang Hội
    const pendingBounties = this.parseBountyRewardMap(questDoc?.pending_bounty_rewards);

    return {
      kits,
      monthlyCheckIn: {
        currentProgress: monthlyProgress,
        maxDays: 31,
        nextDayToClaim,
        lastClaimedAt: monthlyLastClaim,
        canClaimToday,
        nextDayRewards: monthlyMap.get(nextDayToClaim) || [],
      },
      bountyRewards: {
        pendingCount: pendingBounties.length,
        pendingList: pendingBounties,
        reputation: Number(questDoc?.reputation ?? 0),
        maxReputation: Number(questDoc?.max_reputation ?? 0),
        dailyCompleted: Number(questDoc?.daily_completed ?? 0),
        dailyClaimed: Number(questDoc?.daily_claimed ?? 0),
        weeklyPoints: Number(questDoc?.weekly_points ?? 0),
        weeklyGuildPoints: Number(questDoc?.weekly_guild_points ?? 0),
        claimedWeeklyBonus: Boolean(questDoc?.claimed_weekly_bonus),
      },
    };
  }

  // View All cho ADMIN / MODERATOR
  async getAllRewardsAdmin() {
    const [rewardDocs, questDocs] = await Promise.all([
      rewardRepo.getAllPlayerRewardDocs(),
      rewardRepo.getAllQuestProfilesWithPendingBounties(),
    ]);

    const uuidSet = new Set([
      ...rewardDocs.map((d) => d._id),
      ...questDocs.map((q) => q.uuid || q._id),
    ]);
    const usernameMap = await operatorRepo.buildUsernameMap([...uuidSet]);

    const questMap = new Map();
    for (const q of questDocs) {
      const id = q.uuid || q._id;
      questMap.set(id, this.parseBountyRewardMap(q.pending_bounty_rewards));
    }

    const rewardMap = new Map(rewardDocs.map((d) => [d._id, d]));

    const records = [...uuidSet].map((uuid) => {
      const rDoc = rewardMap.get(uuid);
      const pendingBounties = questMap.get(uuid) || [];
      return {
        uuid,
        username: usernameMap.get(uuid) || 'Unknown',
        claimedKits: rDoc?.kits || {},
        monthlyProgress: Number(rDoc?.monthly_progress ?? 0),
        monthlyLastClaim: Number(rDoc?.monthly_last_claim ?? 0),
        pendingBountyCount: pendingBounties.length,
        pendingBounties,
      };
    });

    return {
      totalPlayers: records.length,
      totalPendingBounties: records.reduce((sum, r) => sum + r.pendingBountyCount, 0),
      records,
    };
  }
}

module.exports = new RewardService();