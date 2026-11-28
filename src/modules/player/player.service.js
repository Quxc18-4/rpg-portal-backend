const mongoose = require('mongoose');
const playerRepo = require('./player.repository');
const PlayerAccount = require('../../models/PlayerAccount.model');
const questService = require('./quest.service');
const friendService = require('./friend.service');
const guildService = require('../guild/guild.service');
const { formatCurrency } = require('../../utils/currency.util');
const { decodeItemStackBase64, decodeTrinketsMap } = require('../../utils/itemDecoder.util');
const { AppError } = require('../../utils/error.util');
const { DEFAULT_LANG, t } = require('../../utils/language.util');

// Mirror từ RPGPlayer.getRequiredExp()
function getRequiredPlayerExp(level) {
  const safeLevel = Math.max(1, Number(level || 1));
  const baseExp = 300 + safeLevel * 150 + Math.pow(safeLevel, 3.0) * 1.5;

  let stageMultiplier = 1.0; // Lv 1 - 15
  if (safeLevel >= 16 && safeLevel < 22) {
    stageMultiplier = 1.5; // Hơi chững lại (1-2 tuần)
  } else if (safeLevel >= 22 && safeLevel < 32) {
    stageMultiplier = 3.0; // Bắt đầu khó (> 2 tuần)
  } else if (safeLevel >= 32 && safeLevel < 50) {
    stageMultiplier = 6.0; // Cao (1-2 tháng)
  } else if (safeLevel >= 50 && safeLevel < 75) {
    stageMultiplier = 15.0; // Cày cuốc (3 tháng)
  } else if (safeLevel >= 75 && safeLevel < 101) {
    stageMultiplier = 30.0; // Dài hạn (6 tháng)
  } else if (safeLevel >= 101 && safeLevel < 150) {
    stageMultiplier = 50.0; // Rất dài hạn (1 năm)
  } else if (safeLevel >= 150) {
    stageMultiplier = 80.0; // Tối thượng (2 năm)
  }

  return baseExp * stageMultiplier;
}

class PlayerService {
  async resolveAccessLevel(targetPlayer, viewerUser) {
    if (!viewerUser || !viewerUser.uuid) return 'PUBLIC';
    if (viewerUser.uuid === targetPlayer._id) return 'OWNER';
    if (viewerUser.role === 'ADMIN' || viewerUser.role === 'MODERATOR') return 'OWNER';

    const isFriend = await friendService.areFriends(targetPlayer._id, viewerUser.uuid);
    if (isFriend) return 'FRIEND';

    return 'PUBLIC';
  }

  /**
   * Trích xuất dữ liệu của 1 Slot cụ thể (tương thích ngược với cấu trúc phẳng cũ)
   */
  extractSlotData(playerDoc, requestedSlot = null, maxSlots = 10) {
    const hasSlotsMap =
      playerDoc.slots &&
      typeof playerDoc.slots === 'object' &&
      Object.keys(playerDoc.slots).length > 0;

    const activeSlot = Math.max(1, Number(playerDoc.active_slot || 1));

    if (!hasSlotsMap) {
      if (requestedSlot && Number(requestedSlot) !== 1) {
        throw AppError.badRequest('INVALID_CHARACTER_SLOT');
      }
      return {
        activeSlot: 1,
        selectedSlot: 1,
        slotData: playerDoc,
      };
    }

    const targetSlot =
      requestedSlot !== null && requestedSlot !== undefined
        ? Number(requestedSlot)
        : activeSlot;

    if (!Number.isInteger(targetSlot) || targetSlot < 1 || targetSlot > maxSlots) {
      throw AppError.badRequest('INVALID_CHARACTER_SLOT');
    }

    const slotData = playerDoc.slots[String(targetSlot)] || {
      class: 'commoner',
      level: 1,
      resource: 100,
      exp: 0,
      balance: 0,
      attributes: { unspent: 0, STR: 0, INT: 0, VIT: 0, AGI: 0, LUK: 0 },
      elements: [],
      trinkets: {},
      skills_data: {},
      vanilla_inventory: '',
      ender_chest: '',
    };

    return {
      activeSlot,
      selectedSlot: targetSlot,
      slotData,
    };
  }

  buildSlotsSummary(playerDoc, maxSlots) {
    const activeSlot = Math.max(1, Number(playerDoc.active_slot || 1));
    const slotsObj =
      playerDoc.slots && typeof playerDoc.slots === 'object' ? playerDoc.slots : null;

    const summary = [];
    for (let slotNum = 1; slotNum <= maxSlots; slotNum++) {
      let data = null;
      if (slotsObj) {
        data = slotsObj[String(slotNum)] || null;
      } else if (slotNum === 1) {
        data = playerDoc;
      }

      const isCreated = Boolean(data && Object.keys(data).length > 0);
      summary.push({
        slot: slotNum,
        isActive: slotNum === activeSlot,
        isCreated,
        class: isCreated ? data.class || 'commoner' : null,
        level: isCreated ? Number(data.level || 1) : 0,
        currency: isCreated ? formatCurrency(data.balance || 0) : formatCurrency(0),
      });
    }
    return summary;
  }

  async getLeaderboard() {
    const players = await playerRepo.getTopLevel(10);
    return players.map((p) => ({
      uuid: p._id,
      username: p.username,
      activeSlot: p.activeSlot || 1,
      class: p.class || 'commoner',
      level: p.level || 1,
      exp: p.exp || 0,
    }));
  }

  async getProfile(username, viewerUser = null, requestedSlot = null) {
    const player = await playerRepo.findByUsername(username);
    if (!player) {
      throw new AppError('PLAYER_NOT_FOUND', 404);
    }

    const accessLevel = await this.resolveAccessLevel(player, viewerUser);
    const [account, adventurerRank, guildBadge] = await Promise.all([
      PlayerAccount.findById(player._id).lean(),
      questService.getRankSummaryByUuid(player._id),
      guildService.getPlayerGuildBadge(player._id),
    ]);
    const vipState = PlayerAccount.resolveAccountVipState(account);

    // Người ngoài & Bạn bè chỉ xem được slot đang chơi; chính chủ được chọn ?slot=N
    const effectiveRequestedSlot = accessLevel === 'OWNER' ? requestedSlot : null;
    const { activeSlot, selectedSlot, slotData } = this.extractSlotData(
      player,
      effectiveRequestedSlot,
      vipState.maxSlots
    );

    const level = Number(slotData.level || 1);

    // 1. Dữ liệu Public tối thiểu
    const profile = {
      accessLevel,
      uuid: player._id,
      username: player.username,
      isVip: vipState.isVip,
      adventurerRank,
      guild: guildBadge,
      activeSlot,
      selectedSlot,
      class: slotData.class || 'commoner',
      level,
    };

    // 2. Mở khóa cho Bạn bè hoặc Chính chủ
    if (accessLevel === 'FRIEND' || accessLevel === 'OWNER') {
      const currentExp = Number(slotData.exp ?? 0);
      const requiredExp = getRequiredPlayerExp(level);
      const expProgressPercent = Math.min(
        100,
        Math.max(0, Number(((currentExp / requiredExp) * 100).toFixed(2)))
      );

      profile.resource = slotData.resource ?? 100;
      profile.exp = currentExp;
      profile.requiredExp = requiredExp;
      profile.expProgressPercent = expProgressPercent;
      profile.elements = slotData.elements || [];
      profile.attributes = slotData.attributes || {
        unspent: 0,
        STR: 0,
        INT: 0,
        VIT: 0,
        AGI: 0,
        LUK: 0,
      };
      profile.skills_data = slotData.skills_data || {};
    }

    // 3. Mở khóa độc quyền cho Chính chủ
    if (accessLevel === 'OWNER') {
      profile.vipExpiresAt = vipState.vipExpiresAt;
      profile.maxSlots = vipState.maxSlots;
      profile.hasUnlockedVipSlot = vipState.hasUnlockedVipSlot;
      profile.currency = formatCurrency(slotData.balance || 0);
      profile.slotsSummary = this.buildSlotsSummary(player, vipState.maxSlots);
    }

    return profile;
  }

  async getMyProfile(viewerUser, requestedSlot = null) {
    return this.getProfile(viewerUser.username, viewerUser, requestedSlot);
  }

  async resolveBackpacks(items, options = {}, visitedUuids = new Set(), parentLocation = null) {
    const lang = options.lang || DEFAULT_LANG;
    const resolvedParent = parentLocation || t('INVENTORY_MAIN', lang);

    const bagItems = items.filter((item) => {
      const bagUuid = item.tags?.bag_uuid;
      if (!bagUuid || visitedUuids.has(bagUuid)) return false;
      visitedUuids.add(bagUuid);
      return true;
    });

    if (bagItems.length === 0) return [];

    const bagUuids = bagItems.map((item) => item.tags.bag_uuid);
    const bagDocs = await mongoose.connection.db
      .collection('backpacks')
      .find({ _id: { $in: bagUuids } })
      .toArray();

    const bagMap = new Map(bagDocs.map((doc) => [doc._id, doc]));
    const resolvedBags = [];

    for (const bagItem of bagItems) {
      const bagUuid = bagItem.tags.bag_uuid;
      const doc = bagMap.get(bagUuid);

      const base64Field =
        doc?.items_base64 ||
        (doc
          ? Object.values(doc).find((v) => typeof v === 'string' && v.startsWith('rO0ABX'))
          : null);

      const decodedItems = base64Field ? decodeItemStackBase64(base64Field, options) : [];

      resolvedBags.push({
        bagUuid,
        bagName: bagItem.displayName,
        bagColor: bagItem.color,
        locatedAtSlot: bagItem.slot,
        parentLocation: resolvedParent,
        capacity: decodedItems.capacity ?? decodedItems.length,
        usedSlots: decodedItems.length,
        items: decodedItems,
      });

      const nestedBags = await this.resolveBackpacks(
        decodedItems,
        options,
        visitedUuids,
        `${bagItem.displayName} (Slot ${bagItem.slot})`
      );
      resolvedBags.push(...nestedBags);
    }

    return resolvedBags;
  }

  async getMyInventory(viewerUser, options = {}) {
    const lang = options.lang || DEFAULT_LANG;
    const requestedSlot =
      options.slot !== undefined && options.slot !== null ? Number(options.slot) : null;

    const player = await playerRepo.findByUsername(viewerUser.username);
    if (!player) {
      throw new AppError('PLAYER_NOT_FOUND', 404);
    }

    const account = await PlayerAccount.findById(player._id).lean();
    const vipState = PlayerAccount.resolveAccountVipState(account);
    const { activeSlot, selectedSlot, slotData } = this.extractSlotData(
      player,
      requestedSlot,
      vipState.maxSlots
    );

    const vanillaInventory = decodeItemStackBase64(slotData.vanilla_inventory, options);
    const enderChest = decodeItemStackBase64(slotData.ender_chest, options);
    const trinkets = decodeTrinketsMap(slotData.trinkets, options);

    const visitedUuids = new Set();
    const vanillaBags = await this.resolveBackpacks(
      vanillaInventory,
      options,
      visitedUuids,
      t('INVENTORY_MAIN', lang)
    );
    const enderBags = await this.resolveBackpacks(
      enderChest,
      options,
      visitedUuids,
      t('INVENTORY_ENDER_CHEST', lang)
    );
    const backpacks = [...vanillaBags, ...enderBags];

    const adventurerCard =
      vanillaInventory.find((item) => item.tags?.card_rank)?.tags || null;

    return {
      uuid: player._id,
      username: player.username,
      activeSlot,
      selectedSlot,
      adventurerCard,
      summary: {
        vanillaCount: vanillaInventory.length,
        enderChestCount: enderChest.length,
        trinketsCount: trinkets.length,
        backpacksCount: backpacks.length,
      },
      vanillaInventory,
      enderChest,
      trinkets,
      backpacks,
    };
  }

  async searchMyInventory(viewerUser, keyword, options = {}) {
    const lang = options.lang || DEFAULT_LANG;
    const query = String(keyword || '').trim().toLowerCase();
    if (!query) {
      throw AppError.badRequest('SEARCH_KEYWORD_REQUIRED');
    }

    const inventory = await this.getMyInventory(viewerUser, options);
    const results = [];

    const isMatch = (item) => {
      const nameMatch = item.displayName?.toLowerCase().includes(query);
      const idMatch = item.tags?.rpg_item_id?.toLowerCase().includes(query);
      const loreMatch =
        Array.isArray(item.lore) && item.lore.some((line) => line.toLowerCase().includes(query));
      return nameMatch || idMatch || loreMatch;
    };

    const getVanillaSlotLabel = (slot) => {
      if (slot >= 36 && slot <= 39) return t('LOCATION_EQUIPPED_ARMOR', lang, { slot });
      if (slot === 40) return t('LOCATION_OFFHAND', lang);
      if (slot >= 0 && slot <= 8) return t('LOCATION_HOTBAR', lang, { slot: slot + 1 });
      return t('LOCATION_MAIN_INVENTORY', lang, { slot });
    };

    for (const item of inventory.vanillaInventory) {
      if (isMatch(item)) {
        results.push({
          characterSlot: inventory.selectedSlot,
          containerType: 'VANILLA',
          locationLabel: getVanillaSlotLabel(item.slot),
          slot: item.slot,
          item,
        });
      }
    }

    for (const item of inventory.trinkets) {
      if (isMatch(item)) {
        results.push({
          characterSlot: inventory.selectedSlot,
          containerType: 'TRINKET',
          locationLabel: t('LOCATION_TRINKET', lang, {
            type: item.tags?.trinket_type || `Slot ${item.slot}`,
          }),
          slot: item.slot,
          item,
        });
      }
    }

    for (const item of inventory.enderChest) {
      if (isMatch(item)) {
        results.push({
          characterSlot: inventory.selectedSlot,
          containerType: 'ENDER_CHEST',
          locationLabel: t('LOCATION_ENDER_CHEST', lang, { slot: item.slot }),
          slot: item.slot,
          item,
        });
      }
    }

    for (const bag of inventory.backpacks) {
      for (const item of bag.items) {
        if (isMatch(item)) {
          results.push({
            characterSlot: inventory.selectedSlot,
            containerType: 'BACKPACK',
            bagUuid: bag.bagUuid,
            locationLabel: t('LOCATION_BACKPACK', lang, {
              bagName: bag.bagName,
              parentLocation: bag.parentLocation,
              bagSlot: bag.locatedAtSlot,
              slot: item.slot,
            }),
            slot: item.slot,
            item,
          });
        }
      }
    }

    return {
      keyword: keyword.trim(),
      selectedSlot: inventory.selectedSlot,
      totalMatches: results.length,
      results,
    };
  }
}

module.exports = new PlayerService();