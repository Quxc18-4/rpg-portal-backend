const licenseRepo = require('../repositories/license.repository');
const operatorRepo = require('../repositories/operator.repository');
const safezoneService = require('./safezone.service');

const BETTING_LOCK_THRESHOLD = 80;
const escapeRegex = (str) => String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

class LicenseService {
  parsePlayerProgress(rawEntry, baseTarget) {
    if (rawEntry && typeof rawEntry === 'object') {
      const current = Number(rawEntry.current ?? 0);
      const target = Number(rawEntry.target ?? baseTarget);
      const completed = Number(rawEntry.completed ?? 0);
      return { current, target, completed };
    }
    return {
      current: Number(rawEntry || 0),
      target: baseTarget,
      completed: 0,
    };
  }

  async getLicenses({
    viewerUuid = null,
    includeFullContributors = false,
    status,
    onlyMine = false,
    q = '',
    page = 1,
    limit = 20,
  } = {}) {
    const safePage = Math.max(1, Number(page) || 1);
    const safeLimit = Math.min(100, Math.max(1, Number(limit) || 20));
    const effectiveStatus = status || (viewerUuid || includeFullContributors ? 'all' : 'active');

    const filter = {};
    if (effectiveStatus === 'active') {
      filter.current_amount = { $gt: 0 };
    } else if (effectiveStatus === 'empty') {
      filter.current_amount = { $lte: 0 };
    }

    if (onlyMine && viewerUuid) {
      filter.$or = [
        { [`contributors.${viewerUuid}.current`]: { $gt: 0 } },
        { [`contributors.${viewerUuid}.completed`]: { $gt: 0 } },
        { [`contributors.${viewerUuid}`]: { $gt: 0 } },
      ];
    }

    const cleanKeyword = String(q || '').trim();
    if (cleanKeyword) {
      filter.item_id = { $regex: escapeRegex(cleanKeyword), $options: 'i' };
    }

    const { items: docs, totalItems, summary } = await licenseRepo.findPaginated({
      filter,
      page: safePage,
      limit: safeLimit,
    });

    const uuidSet = new Set();
    for (const doc of docs) {
      if (doc.contributors && typeof doc.contributors === 'object') {
        Object.keys(doc.contributors).forEach((uuid) => uuidSet.add(uuid));
      }
    }
    const usernameMap = await operatorRepo.buildUsernameMap([...uuidSet]);

    const licenses = docs.map((doc) => {
      const totalActiveDeposited = Number(doc.current_amount ?? 0);
      const baseTargetAmount = Number(doc.target_amount ?? 1000);
      const contributorsObj =
        doc.contributors && typeof doc.contributors === 'object' ? doc.contributors : {};

      const contributorList = Object.entries(contributorsObj)
        .map(([uuid, rawEntry]) => {
          const { current, target, completed } = this.parsePlayerProgress(rawEntry, baseTargetAmount);
          const progressPercent =
            target > 0 ? Math.min(100, Math.round((current / target) * 100)) : 100;

          return {
            uuid,
            username: usernameMap.get(uuid) || 'Unknown',
            currentAmount: current,
            targetAmount: target,
            progressPercent,
            completedCount: completed,
          };
        })
        .sort((a, b) => b.progressPercent - a.progressPercent || b.currentAmount - a.currentAmount);

      const activeRacers = contributorList.filter((c) => c.currentAmount > 0);
      const leaderProgressPercent =
        activeRacers.length > 0 ? activeRacers[0].progressPercent : 0;

      // Kèo Hot: có người đạt >= 50% hoặc có từ 2 người trở lên đang cùng đua
      const isHotRace =
        activeRacers.length > 0 &&
        (leaderProgressPercent >= 50 || activeRacers.length >= 2);

      // Chỉ mở cược khi có ít nhất 1 ứng viên đang góp và người dẫn đầu chưa chạm 80%
      const isBettingOpen =
        activeRacers.length > 0 && leaderProgressPercent < BETTING_LOCK_THRESHOLD;

      let myProgress = null;
      if (viewerUuid) {
        const { current, target, completed } = this.parsePlayerProgress(
          contributorsObj[viewerUuid],
          baseTargetAmount
        );
        const progressPercent =
          target > 0 ? Math.min(100, Math.round((current / target) * 100)) : 100;

        myProgress = {
          currentAmount: current,
          targetAmount: target,
          remainingAmount: Math.max(0, target - current),
          progressPercent,
          completedCount: completed,
          isNearCompletion: progressPercent >= 75,
          canWithdrawInGame: current > 0,
        };
      }

      const formatted = {
        id: String(doc._id),
        itemId: doc.item_id,
        displayName: safezoneService.formatMinecraftName(doc.item_id),
        baseTargetAmount,
        totalActiveDeposited,
        isBound: false,
        raceStatus: {
          isHotRace,
          isBettingOpen,
          lockThresholdPercent: BETTING_LOCK_THRESHOLD,
          leaderProgressPercent,
          activeRacersCount: activeRacers.length,
        },
        contributorsCount: contributorList.length,
        topInvestors: contributorList
          .slice(0, 5)
          .map(({ username, currentAmount, targetAmount, progressPercent, completedCount }) => ({
            username,
            currentAmount,
            targetAmount,
            progressPercent,
            completedCount,
          })),
        ...(viewerUuid && { myProgress }),
      };

      if (includeFullContributors) {
        formatted.contributors = contributorList;
      }

      return formatted;
    });

    return {
      summary,
      items: licenses,
      pagination: {
        page: safePage,
        limit: safeLimit,
        totalItems,
        totalPages: Math.max(1, Math.ceil(totalItems / safeLimit)),
      },
    };
  }
}

module.exports = new LicenseService();