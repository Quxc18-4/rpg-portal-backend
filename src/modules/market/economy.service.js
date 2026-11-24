const economyRepo = require('./economy.repository');
const { formatCurrency } = require('../../utils/currency.util');

class EconomyService {
  calculatePrices(item, threshold = 1000) {
    const demandWeight = 5.0;
    const weightedBought = item.total_bought * demandWeight;
    const netFlow = weightedBought - item.total_sold;

    let percentChange = netFlow / threshold;
    if (percentChange > 50.0) percentChange = 50.0;
    if (percentChange < -50.0) percentChange = -50.0;

    const multiplier = 1.0 + percentChange / 100.0;
    const currentBuy = Math.max(1, Math.round(item.base_buy_price * multiplier));
    const currentSell = Math.max(1, Math.round(item.base_sell_price * multiplier));

    const nextTotalBought = Math.floor((item.total_bought + (item.pending_bought || 0)) * 0.95);
    const nextTotalSold = Math.floor((item.total_sold + (item.pending_sold || 0)) * 0.95);
    const nextNetFlow = nextTotalBought * demandWeight - nextTotalSold;
    let nextPercent = Math.max(-50, Math.min(50, nextNetFlow / threshold));
    const nextMultiplier = 1.0 + nextPercent / 100.0;

    return {
      itemId: item._id,
      percentChange: Number(percentChange.toFixed(2)),
      currentBuyPrice: formatCurrency(currentBuy),
      currentSellPrice: formatCurrency(currentSell),
      projectedBuyPrice: formatCurrency(Math.max(1, Math.round(item.base_buy_price * nextMultiplier))),
      pendingBought: item.pending_bought || 0,
      pendingSold: item.pending_sold || 0,
    };
  }

  async getMarketOverview() {
    const items = await economyRepo.getAllItems();
    return items.map((item) => this.calculatePrices(item));
  }
}

module.exports = new EconomyService();
