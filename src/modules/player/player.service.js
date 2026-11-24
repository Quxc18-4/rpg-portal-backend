const mongoose = require('mongoose');
const playerRepo = require('./player.repository');
const { formatCurrency } = require('../../utils/currency.util');
const { decodeItemStackBase64, decodeTrinketsMap } = require('../../utils/itemDecoder.util');
const { AppError } = require('../../utils/error.util');
const { DEFAULT_LANG, t } = require('../../utils/language.util');

class PlayerService {
  resolveAccessLevel(targetPlayer, viewerUser) {
    if (!viewerUser || !viewerUser.uuid) return 'PUBLIC';
    if (viewerUser.uuid === targetPlayer._id) return 'OWNER';

    const friendList = Array.isArray(targetPlayer.friends) ? targetPlayer.friends : [];
    if (friendList.includes(viewerUser.uuid)) return 'FRIEND';

    return 'PUBLIC';
  }

  async getLeaderboard() {
    const players = await playerRepo.getTopLevel(10);
    // Bảng xếp hạng công khai chỉ hiển thị cấp độ, không lộ số dư chi tiết
    return players.map((p) => ({
      uuid: p._id,
      username: p.username,
      class: p.class,
      level: p.level,
      exp: p.exp,
    }));
  }

  async getProfile(username, viewerUser = null) {
    const player = await playerRepo.findByUsername(username);
    if (!player) {
      throw new AppError('PLAYER_NOT_FOUND', 404);
    }

    const accessLevel = this.resolveAccessLevel(player, viewerUser);

    // 1. Dữ liệu Public tối thiểu (Ai cũng xem được)
    const profile = {
      accessLevel,
      uuid: player._id,
      username: player.username,
      class: player.class,
      level: player.level,
    };

    // 2. Mở khóa cho Bạn bè hoặc Chính chủ
    if (accessLevel === 'FRIEND' || accessLevel === 'OWNER') {
      profile.resource = player.resource;
      profile.exp = player.exp;
      profile.elements = player.elements;
      profile.attributes = player.attributes;
      profile.skills_data = player.skills_data;
    }

    // 3. Mở khóa độc quyền cho Chính chủ (Bearer JWT khớp UUID)
    if (accessLevel === 'OWNER') {
      profile.currency = formatCurrency(player.balance);
    }

    return profile;
  }

  async getMyProfile(viewerUser) {
    return this.getProfile(viewerUser.username, viewerUser);
  }

  /**
   * Giải mã danh sách backpacks từ các item có tag `bag_uuid` (hỗ trợ đệ quy túi lồng túi)
   */
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

      // Ưu tiên trường items_base64 chuẩn, fallback tự dò chuỗi Base64
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

      // Quét đệ quy nếu bên trong túi này có chứa thêm túi khác
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
    const player = await playerRepo.findByUsername(viewerUser.username);
    if (!player) {
      throw new AppError('PLAYER_NOT_FOUND', 404);
    }

    const vanillaInventory = decodeItemStackBase64(player.vanilla_inventory, options);
    const enderChest = decodeItemStackBase64(player.ender_chest, options);
    const trinkets = decodeTrinketsMap(player.trinkets, options);

    // Giải mã tất cả túi phụ từ cả túi chính lẫn rương Ender
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

    // Trích xuất thông tin Thẻ Mạo Hiểm Giả nếu có trong túi
    const adventurerCard =
      vanillaInventory.find((item) => item.tags?.card_rank)?.tags || null;

    return {
      uuid: player._id,
      username: player.username,
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

  /**
   * Tìm kiếm vật phẩm xuyên suốt: Túi chính, Giáp, Trang sức, Ender Chest & Tất cả Backpacks
   */
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
      totalMatches: results.length,
      results,
    };
  }
}

module.exports = new PlayerService();