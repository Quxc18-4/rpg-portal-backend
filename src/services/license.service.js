const licenseRepo = require('../repositories/license.repository');
const operatorRepo = require('../repositories/operator.repository');
const safezoneService = require('./safezone.service');

class LicenseService {
  async getAllLicenses({ viewerUuid = null, includeFullContributors = false } = {}) {
    const docs = await licenseRepo.findAll();

    const uuidSet = new Set();
    for (const doc of docs) {
      if (doc.contributors && typeof doc.contributors === 'object') {
        Object.keys(doc.contributors).forEach((uuid) => uuidSet.add(uuid));
      }
    }
    const usernameMap = await operatorRepo.buildUsernameMap([...uuidSet]);

    const licenses = docs.map((doc) => {
      const currentAmount = Number(doc.current_amount ?? 0);
      const targetAmount = Number(doc.target_amount ?? 0);
      const contributorsObj =
        doc.contributors && typeof doc.contributors === 'object' ? doc.contributors : {};

      const contributorList = Object.entries(contributorsObj)
        .map(([uuid, amount]) => {
          const numericAmount = Number(amount || 0);
          return {
            uuid,
            username: usernameMap.get(uuid) || 'Unknown',
            amount: numericAmount,
            sharePercent:
              currentAmount > 0
                ? Math.round((numericAmount / currentAmount) * 1000) / 10
                : 0,
          };
        })
        .sort((a, b) => b.amount - a.amount);

      const myAmount = viewerUuid ? Number(contributorsObj[viewerUuid] || 0) : 0;

      const formatted = {
        id: String(doc._id),
        itemId: doc.item_id,
        displayName: safezoneService.formatMinecraftName(doc.item_id),
        currentAmount,
        targetAmount,
        remainingAmount: Math.max(0, targetAmount - currentAmount),
        progressPercent:
          targetAmount > 0 ? Math.min(100, Math.round((currentAmount / targetAmount) * 100)) : 100,
        isCompleted: targetAmount > 0 && currentAmount >= targetAmount,
        isBound: false,
        contributorsCount: contributorList.length,
        topContributors: contributorList.slice(0, 5).map(({ username, amount, sharePercent }) => ({
          username,
          amount,
          sharePercent,
        })),
        ...(viewerUuid && {
          myContribution: {
            amount: myAmount,
            sharePercent:
              currentAmount > 0 ? Math.round((myAmount / currentAmount) * 1000) / 10 : 0,
          },
        }),
      };

      if (includeFullContributors) {
        formatted.contributors = contributorList;
      }

      return formatted;
    });

    return {
      total: licenses.length,
      completedCount: licenses.filter((l) => l.isCompleted).length,
      inProgressCount: licenses.filter((l) => !l.isCompleted).length,
      licenses,
    };
  }
}

module.exports = new LicenseService();