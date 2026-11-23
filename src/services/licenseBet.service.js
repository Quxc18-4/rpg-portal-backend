const licenseRepo = require('../repositories/license.repository');
const licenseBetRepo = require('../repositories/licenseBet.repository');
const operatorRepo = require('../repositories/operator.repository');
const safezoneService = require('./safezone.service');
const licenseService = require('./license.service');
const { formatCurrency } = require('../utils/currency.util');
const { translate } = require('../utils/language.util');

const BETTING_LOCK_THRESHOLD = 80;
const MIN_BET_AMOUNT = 10;
const HOUSE_TAX_RATE = 0.05; // 5% thuế sàn tiêu hủy tiền thừa chống lạm phát
const SETTLEMENT_GRACE_MS = 6000; // Chờ 6s để WebActionManager (3s) xử lý xong các lệnh trừ tiền sát giờ
const WORKER_INTERVAL_MS = 15000; // 15 giây quét 1 lần

const createHttpError = (statusCode, messageKey, lang = 'vi') => {
  const err = new Error(translate(messageKey, lang));
  err.statusCode = statusCode;
  err.messageKey = messageKey;
  return err;
};

class LicenseBetService {
  constructor() {
    this.workerTimer = null;
    this.isSettling = false;
  }

  // ==========================================
  // BƯỚC 1: ĐẶT CƯỢC TỪ WEB
  // ==========================================
  async placeBet({ bettorUuid, bettorUsername, itemId, candidateUuid, amount, lang = 'vi' }) {
    const numericAmount = Math.floor(Number(amount));
    if (!Number.isFinite(numericAmount) || numericAmount < MIN_BET_AMOUNT) {
      throw createHttpError(400, 'BET_INVALID_AMOUNT', lang);
    }

    if (!candidateUuid || typeof candidateUuid !== 'string') {
      throw createHttpError(400, 'BET_INVALID_CANDIDATE', lang);
    }

    // 1. Kiểm tra mặt hàng có đang chờ chốt kèo vừa hoàn thành không
    const hasPendingWinner = await licenseBetRepo.hasUnsettledHistoryForItem(itemId);
    if (hasPendingWinner) {
      throw createHttpError(400, 'BET_LOCKED_THRESHOLD', lang);
    }

    // 2. Lấy dữ liệu quỹ đầu tư hiện tại của mặt hàng
    const doc = await licenseRepo.findByItemId(itemId);
    if (!doc) {
      throw createHttpError(404, 'NOT_FOUND', lang);
    }

    const baseTargetAmount = Number(doc.target_amount ?? 1000);
    const contributorsObj =
      doc.contributors && typeof doc.contributors === 'object' ? doc.contributors : {};

    const activeRacers = [];
    for (const [uuid, rawEntry] of Object.entries(contributorsObj)) {
      const { current, target, completed } = licenseService.parsePlayerProgress(
        rawEntry,
        baseTargetAmount
      );
      if (current > 0) {
        const progressPercent =
          target > 0 ? Math.min(100, Math.round((current / target) * 100)) : 100;
        activeRacers.push({ uuid, current, target, completed, progressPercent });
      }
    }

    if (activeRacers.length === 0) {
      throw createHttpError(400, 'BET_NO_ACTIVE_RACERS', lang);
    }

    // 3. Khóa kèo nếu người dẫn đầu đã đạt >= 80%
    const leaderProgressPercent = Math.max(...activeRacers.map((r) => r.progressPercent));
    if (leaderProgressPercent >= BETTING_LOCK_THRESHOLD) {
      throw createHttpError(400, 'BET_LOCKED_THRESHOLD', lang);
    }

    // 4. Ứng viên được đặt cược phải đang thực sự góp vốn (> 0) ở mặt hàng này
    const candidateRacer = activeRacers.find((r) => r.uuid === candidateUuid);
    if (!candidateRacer) {
      throw createHttpError(400, 'BET_INVALID_CANDIDATE', lang);
    }

    const usernameMap = await operatorRepo.buildUsernameMap([bettorUuid, candidateUuid]);
    const resolvedBettorName = usernameMap.get(bettorUuid) || bettorUsername || 'Unknown';
    const resolvedCandidateName = usernameMap.get(candidateUuid) || 'Unknown';
    const displayName = safezoneService.formatMinecraftName(itemId);

    // 5. Tạo phiếu cược PENDING_DEBIT + đẩy lệnh trừ tiền LICENSE_BET_DEBIT sang plugin
    const createdBet = await licenseBetRepo.createBetWithDebitAction(
      {
        bettorUuid,
        bettorUsername: resolvedBettorName,
        itemId,
        itemDisplayName: displayName,
        candidateUuid,
        candidateUsername: resolvedCandidateName,
        amount: numericAmount,
        baselineCompleted: candidateRacer.completed,
        snapshotProgressPercent: candidateRacer.progressPercent,
      },
      {
        targetUsername: resolvedBettorName,
        reason: `Đặt cược ${numericAmount} Đồng vào ${resolvedCandidateName} (${itemId})`,
      }
    );

    return {
      betId: String(createdBet._id),
      itemId,
      itemDisplayName: displayName,
      candidateUuid,
      candidateUsername: resolvedCandidateName,
      amount: numericAmount,
      formattedAmount: formatCurrency(numericAmount),
      status: createdBet.status,
      createdAt: createdBet.createdAt,
    };
  }

  // ==========================================
  // XEM TỶ LỆ & TỔNG QUỸ CƯỢC CỦA 1 MẶT HÀNG
  // ==========================================
  async getItemBettingPool(itemId, lang = 'vi') {
    const doc = await licenseRepo.findByItemId(itemId);
    if (!doc) {
      throw createHttpError(404, 'NOT_FOUND', lang);
    }

    const baseTargetAmount = Number(doc.target_amount ?? 1000);
    const contributorsObj =
      doc.contributors && typeof doc.contributors === 'object' ? doc.contributors : {};

    const racers = Object.entries(contributorsObj)
      .map(([uuid, rawEntry]) => {
        const { current, target, completed } = licenseService.parsePlayerProgress(
          rawEntry,
          baseTargetAmount
        );
        const progressPercent =
          target > 0 ? Math.min(100, Math.round((current / target) * 100)) : 100;
        return { uuid, current, target, completed, progressPercent };
      })
      .filter((r) => r.current > 0)
      .sort((a, b) => b.progressPercent - a.progressPercent || b.current - a.current);

    const [usernameMap, { totalPool, byCandidate }, hasPendingWinner] = await Promise.all([
      operatorRepo.buildUsernameMap(racers.map((r) => r.uuid)),
      licenseBetRepo.getConfirmedPoolBreakdown(itemId),
      licenseBetRepo.hasUnsettledHistoryForItem(itemId),
    ]);

    const leaderProgressPercent = racers.length > 0 ? racers[0].progressPercent : 0;
    const isBettingOpen =
      !hasPendingWinner && racers.length > 0 && leaderProgressPercent < BETTING_LOCK_THRESHOLD;

    const candidates = racers.map((r) => {
      const poolInfo = byCandidate.get(r.uuid) || { totalAmount: 0, ticketCount: 0 };
      const losePool = Math.max(0, totalPool - poolInfo.totalAmount);
      // Hệ số nhân ước tính nếu cửa này thắng (vốn + 95% tổng quỹ các cửa thua)
      const estimatedMultiplier =
        poolInfo.totalAmount > 0
          ? Math.round((1 + (losePool * (1 - HOUSE_TAX_RATE)) / poolInfo.totalAmount) * 100) / 100
          : null;

      return {
        candidateUuid: r.uuid,
        candidateUsername: usernameMap.get(r.uuid) || 'Unknown',
        currentAmount: r.current,
        targetAmount: r.target,
        progressPercent: r.progressPercent,
        completedCount: r.completed,
        poolStaked: poolInfo.totalAmount,
        ticketCount: poolInfo.ticketCount,
        estimatedMultiplier,
      };
    });

    return {
      itemId,
      displayName: safezoneService.formatMinecraftName(itemId),
      isBettingOpen,
      lockThresholdPercent: BETTING_LOCK_THRESHOLD,
      leaderProgressPercent,
      houseTaxPercent: HOUSE_TAX_RATE * 100,
      totalPool,
      formattedTotalPool: formatCurrency(totalPool),
      candidates,
    };
  }

  // ==========================================
  // BƯỚC 2 & 3: WORKER 15S CHỐT KÈO & TRẢ THƯỞNG PARIMUTUEL
  // ==========================================
  startSettlementWorker() {
    if (this.workerTimer) return;
    this.workerTimer = setInterval(() => {
      this.processPendingSettlements().catch((err) => {
        console.error('[LicenseBetWorker] Lỗi chu kỳ chốt kèo:', err.message);
      });
    }, WORKER_INTERVAL_MS);
    console.log('[LicenseBetWorker] Đã kích hoạt worker chốt kèo Giấy Phép (chu kỳ 15s).');
  }

  stopSettlementWorker() {
    if (this.workerTimer) {
      clearInterval(this.workerTimer);
      this.workerTimer = null;
    }
  }

  async processPendingSettlements() {
    if (this.isSettling) return { processedCount: 0, skipped: true };
    this.isSettling = true;

    try {
      const unsettledHistories = await licenseBetRepo.findUnsettledHistories();
      const now = Date.now();
      let processedCount = 0;

      for (const history of unsettledHistories) {
        const completedAtMs = Number(history.completed_at || 0);
        // Chờ 6 giây sau thời điểm về nhất để WebActionManager kịp trừ tiền các phiếu sát giờ
        if (completedAtMs > 0 && now - completedAtMs < SETTLEMENT_GRACE_MS) {
          continue;
        }

        await this.settleSingleHistory(history);
        processedCount += 1;
      }

      return { processedCount };
    } finally {
      this.isSettling = false;
    }
  }

  async settleSingleHistory(history) {
    const itemId = history.item_id;
    const winnerUuid = history.winner_uuid;
    const winnerName = history.winner_name || 'Unknown';
    const completedAtDate = history.completed_at ? new Date(Number(history.completed_at)) : new Date();
    const displayName = safezoneService.formatMinecraftName(itemId);

    const allConfirmed = await licenseBetRepo.findConfirmedBetsByItem(itemId);
    // Chỉ chốt những phiếu đã đặt trước hoặc đúng thời điểm người chơi về nhất
    const eligibleBets = allConfirmed.filter(
      (b) => !b.createdAt || new Date(b.createdAt) <= completedAtDate
    );

    if (eligibleBets.length === 0) {
      await licenseBetRepo.markHistorySettled(history._id);
      return;
    }

    const totalPool = eligibleBets.reduce((sum, b) => sum + Number(b.amount || 0), 0);
    const winningBets = eligibleBets.filter((b) => b.candidateUuid === winnerUuid);
    const losingBets = eligibleBets.filter((b) => b.candidateUuid !== winnerUuid);

    const payoutActions = [];

    // Trường hợp A: Không ai đặt cược trúng người về nhất -> Hoàn 100% tiền cược
    if (winningBets.length === 0) {
      for (const bet of eligibleBets) {
        const refund = Number(bet.amount || 0);
        await licenseBetRepo.markBetSettled(bet._id, {
          status: 'REFUNDED',
          payoutAmount: refund,
          winnerUuid,
          winnerName,
        });

        payoutActions.push({
          betId: String(bet._id),
          targetUuid: bet.bettorUuid,
          targetUsername: bet.bettorUsername,
          amount: refund,
          itemId,
          reason: `Hoàn cược kèo ${itemId} (không có người đoán trúng ${winnerName})`,
          message: `§e[Dự Đoán] §fKhông ai đoán trúng §b${winnerName} §fở kèo §a${displayName}§f. Hoàn 100% cược: §e${formatCurrency(refund)}§f!`,
        });
      }
    }
    // Trường hợp B: Có người đoán trúng -> Chia quỹ Parimutuel (vốn + 95% tổng quỹ cửa thua)
    else {
      const totalWinStake = winningBets.reduce((sum, b) => sum + Number(b.amount || 0), 0);
      const totalLoseStake = losingBets.reduce((sum, b) => sum + Number(b.amount || 0), 0);
      const distributableLosePool = Math.floor(totalLoseStake * (1 - HOUSE_TAX_RATE));

      for (const bet of winningBets) {
        const stake = Number(bet.amount || 0);
        const profitShare =
          totalWinStake > 0 ? Math.floor((stake / totalWinStake) * distributableLosePool) : 0;
        const payout = stake + profitShare;

        await licenseBetRepo.markBetSettled(bet._id, {
          status: 'WON',
          payoutAmount: payout,
          winnerUuid,
          winnerName,
        });

        payoutActions.push({
          betId: String(bet._id),
          targetUuid: bet.bettorUuid,
          targetUsername: bet.bettorUsername,
          amount: payout,
          itemId,
          reason: `Trả thưởng thắng cược ${itemId} (Winner: ${winnerName})`,
          message: `§a§l[Thắng Cược] §fChúc mừng! §b${winnerName} §fđã về nhất kèo §e${displayName}§f. Bạn nhận được §6${formatCurrency(payout)}§f!`,
        });
      }

      for (const bet of losingBets) {
        await licenseBetRepo.markBetSettled(bet._id, {
          status: 'LOST',
          payoutAmount: 0,
          winnerUuid,
          winnerName,
        });
      }
    }

    await licenseBetRepo.enqueuePayoutActions(payoutActions);
    await licenseBetRepo.markHistorySettled(history._id);
  }

  // ==========================================
  // LỊCH SỬ CƯỢC CÁ NHÂN & ADMIN
  // ==========================================
  async getMyBets(bettorUuid, { page = 1, limit = 20 } = {}) {
    const safePage = Math.max(1, Number(page) || 1);
    const safeLimit = Math.min(100, Math.max(1, Number(limit) || 20));
    const { items, totalItems } = await licenseBetRepo.findBetsByBettor(bettorUuid, {
      page: safePage,
      limit: safeLimit,
    });

    return {
      items: items.map((b) => ({
        betId: String(b._id),
        itemId: b.itemId,
        itemDisplayName: b.itemDisplayName || safezoneService.formatMinecraftName(b.itemId),
        candidateUuid: b.candidateUuid,
        candidateUsername: b.candidateUsername,
        amount: b.amount,
        formattedAmount: formatCurrency(b.amount),
        status: b.status,
        payoutAmount: b.payoutAmount || 0,
        formattedPayoutAmount: formatCurrency(b.payoutAmount || 0),
        winnerName: b.winnerName || null,
        failReason: b.failReason || null,
        createdAt: b.createdAt,
        settledAt: b.settledAt || null,
      })),
      pagination: {
        page: safePage,
        limit: safeLimit,
        totalItems,
        totalPages: Math.max(1, Math.ceil(totalItems / safeLimit)),
      },
    };
  }

  async getAllBetsAdmin({ status, itemId, page = 1, limit = 20 } = {}) {
    const safePage = Math.max(1, Number(page) || 1);
    const safeLimit = Math.min(100, Math.max(1, Number(limit) || 20));
    const { items, totalItems } = await licenseBetRepo.findAllBetsAdmin({
      status,
      itemId,
      page: safePage,
      limit: safeLimit,
    });

    return {
      items: items.map((b) => ({
        betId: String(b._id),
        bettorUuid: b.bettorUuid,
        bettorUsername: b.bettorUsername,
        itemId: b.itemId,
        itemDisplayName: b.itemDisplayName || safezoneService.formatMinecraftName(b.itemId),
        candidateUuid: b.candidateUuid,
        candidateUsername: b.candidateUsername,
        amount: b.amount,
        status: b.status,
        payoutAmount: b.payoutAmount || 0,
        winnerUsername: b.winnerName || null,
        failReason: b.failReason || null,
        createdAt: b.createdAt,
        settledAt: b.settledAt || null,
      })),
      pagination: {
        page: safePage,
        limit: safeLimit,
        totalItems,
        totalPages: Math.max(1, Math.ceil(totalItems / safeLimit)),
      },
    };
  }
}

module.exports = new LicenseBetService();