const jobRepo = require('./job.repository');
const { formatCurrency } = require('../../utils/currency.util');

class JobService {
  async getMyJobs(uuid) {
    const doc = await jobRepo.findByUuid(uuid);
    if (!doc) {
      return {
        currentJob: null,
        scraps: 0,
        jobs: {},
        activeDaily: [],
        activeWeekly: [],
        dailyMilestone: 0,
        merchantAccumulated: formatCurrency(0),
      };
    }

    const levels = doc.levels || {};
    const exps = doc.exps || {};
    const jobKeys = new Set([...Object.keys(levels), ...Object.keys(exps)]);

    const jobs = {};
    for (const jobId of jobKeys) {
      jobs[jobId] = {
        level: levels[jobId] || 1,
        exp: exps[jobId] || 0,
        points: doc.jobPoints?.[jobId] || 0,
        unlockedSkills: doc.unlockedSkills?.[jobId] || [],
      };
    }

    return {
      currentJob: doc.currentJob || null,
      scraps: doc.scraps || 0,
      jobs,
      questProgress: doc.questProgress || {},
      questClaimed: doc.questClaimed || {},
      shopPurchases: doc.shopPurchases || {},
      activeDaily: doc.activeDaily || [],
      activeWeekly: doc.activeWeekly || [],
      dailyMilestone: doc.dailyMilestone || 0,
      timers: {
        lastDailyReset: doc.lastDailyReset || 0,
        lastWeeklyReset: doc.lastWeeklyReset || 0,
        lastMonthlyShopReset: doc.lastMonthlyShopReset || 0,
      },
      merchantAccumulated: formatCurrency(doc.merchantAccumulatedCoins || 0),
    };
  }
}

module.exports = new JobService();