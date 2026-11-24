const npcLookupRepo = require('./npcLookup.repository');
const economyRepo = require('./economy.repository');
const economyService = require('./economy.service');
const operatorRepo = require('../operator/operator.repository');
const { decodeItemStackBase64, matchDecodedItem } = require('../../utils/itemDecoder.util');
const { formatCurrency } = require('../../utils/currency.util');
const { t } = require('../../utils/language.util');

const stripMinecraftColors = (text) =>
  String(text || '')
    .replace(/§[0-9a-fk-orx]/gi, '')
    .trim();

const removeVietnameseAccents = (str) =>
  String(str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim();

const createHttpError = (statusCode, messageKey, lang = 'vi') => {
  const err = new Error(t(messageKey, lang));
  err.statusCode = statusCode;
  err.messageKey = messageKey;
  return err;
};

class NpcLookupService {
  async resolveVipAccess(user) {
    if (!user || !user.uuid) {
      return { isVip: false, vipTier: 'NONE', vipExpiresAt: null };
    }

    // Staff (ADMIN / MODERATOR) mặc định có quyền tra cứu
    if (user.role === 'ADMIN' || user.role === 'MODERATOR') {
      return { isVip: true, vipTier: user.role, vipExpiresAt: null };
    }

    const account = await npcLookupRepo.getPlayerVipRecord(user.uuid);
    if (!account) {
      return { isVip: false, vipTier: 'NONE', vipExpiresAt: null };
    }

    const now = Date.now();
    const expiresAtMs = account.vip_expires_at ? new Date(account.vip_expires_at).getTime() : null;
    const hasValidExpiry = expiresAtMs !== null && Number.isFinite(expiresAtMs);

    let isVip = false;
    if (hasValidExpiry) {
      isVip = expiresAtMs > now;
    } else {
      isVip = Boolean(account.is_vip) || Boolean(account.vip_tier && account.vip_tier !== 'NONE');
    }

    return {
      isVip,
      vipTier: isVip ? account.vip_tier || 'VIP' : 'NONE',
      vipExpiresAt: hasValidExpiry ? new Date(expiresAtMs).toISOString() : null,
    };
  }

  matchesKeyword(decodedItem, rawKeyword, normalizedNoAccentKeyword) {
    if (matchDecodedItem(decodedItem, rawKeyword)) return true;
    if (!normalizedNoAccentKeyword) return false;

    const searchableText = [
      decodedItem.displayName,
      decodedItem.type,
      Array.isArray(decodedItem.lore) ? decodedItem.lore.join(' ') : '',
      decodedItem.tags && typeof decodedItem.tags === 'object'
        ? Object.values(decodedItem.tags).join(' ')
        : '',
    ]
      .filter(Boolean)
      .join(' ');

    return removeVietnameseAccents(searchableText).includes(normalizedNoAccentKeyword);
  }

  buildItemPricing(rpgItemId, slotData, globalEcoMap) {
    if (rpgItemId && globalEcoMap.has(rpgItemId)) {
      const calc = economyService.calculatePrices(globalEcoMap.get(rpgItemId));
      return {
        source: 'GLOBAL_ECONOMY',
        percentChange: calc.percentChange,
        currentBuyPrice: calc.currentBuyPrice,
        currentSellPrice: calc.currentSellPrice,
      };
    }

    const fallbackBuy = Number(slotData?.buyPrice || 0);
    const fallbackSell = Number(slotData?.sellPrice || 0);
    return {
      source: 'SHOP_STATIC',
      percentChange: 0,
      currentBuyPrice: formatCurrency(fallbackBuy),
      currentSellPrice: formatCurrency(fallbackSell),
    };
  }

  async searchNpcItems({ query, user = null, lang = 'vi' }) {
    const cleanQuery = String(query || '').trim();
    if (cleanQuery.length < 2) {
      throw createHttpError(400, 'NPC_LOOKUP_QUERY_TOO_SHORT', lang);
    }

    const noAccentQuery = removeVietnameseAccents(cleanQuery);

    const [vipStatus, { shops, npcs }, ecoItems] = await Promise.all([
      this.resolveVipAccess(user),
      npcLookupRepo.getAllShopsAndNpcs(),
      economyRepo.getAllItems(),
    ]);

    // Map shop_id -> danh sách NPC đang vận hành shop đó
    const npcsByShopId = new Map();
    const waystoneIds = [];
    const ownerUuids = [];

    for (const npc of npcs) {
      if (!npc.shop_id) continue;
      if (!npcsByShopId.has(npc.shop_id)) {
        npcsByShopId.set(npc.shop_id, []);
      }
      npcsByShopId.get(npc.shop_id).push(npc);

      if (npc.waystone_id) waystoneIds.push(npc.waystone_id);
      if (npc.owner_id) ownerUuids.push(npc.owner_id);
    }

    const globalEcoMap = new Map(ecoItems.map((e) => [e._id, e]));
    const [waystoneMap, ownerNameMap] = await Promise.all([
      vipStatus.isVip ? npcLookupRepo.getWaystonesByIds(waystoneIds) : Promise.resolve(new Map()),
      vipStatus.isVip ? operatorRepo.buildUsernameMap(ownerUuids) : Promise.resolve(new Map()),
    ]);

    // Gom nhóm kết quả theo từng loại vật phẩm
    const matchedItemsMap = new Map();

    for (const shop of shops) {
      const linkedNpcs = npcsByShopId.get(shop._id);
      if (!linkedNpcs || linkedNpcs.length === 0) continue;
      if (!shop.data || typeof shop.data !== 'object') continue;

      for (const [pageKey, slotsObj] of Object.entries(shop.data)) {
        if (!slotsObj || typeof slotsObj !== 'object') continue;

        for (const [slotKey, slotData] of Object.entries(slotsObj)) {
          if (!slotData || typeof slotData.item !== 'string') continue;

          const decodedList = decodeItemStackBase64(slotData.item);
          if (!decodedList || decodedList.length === 0) continue;

          const decodedItem = decodedList[0];
          if (!this.matchesKeyword(decodedItem, cleanQuery, noAccentQuery)) continue;

          const rpgItemId = decodedItem.tags?.rpg_item_id || null;
          const groupKey = rpgItemId || `${decodedItem.type}:${decodedItem.displayName}`;

          if (!matchedItemsMap.has(groupKey)) {
            matchedItemsMap.set(groupKey, {
              itemId: rpgItemId || decodedItem.type,
              displayName: decodedItem.displayName,
              material: decodedItem.type,
              lore: Array.isArray(decodedItem.lore) ? decodedItem.lore : [],
              pricing: this.buildItemPricing(rpgItemId, slotData, globalEcoMap),
              sellers: [],
              _seenNpcSlot: new Set(),
            });
          }

          const itemGroup = matchedItemsMap.get(groupKey);

          for (const npc of linkedNpcs) {
            const dedupeKey = `${npc._id}:${pageKey}:${slotKey}`;
            if (itemGroup._seenNpcSlot.has(dedupeKey)) continue;
            itemGroup._seenNpcSlot.add(dedupeKey);

            const isPlayerShop = Boolean(npc.owner_id && npc.owner_id.trim() !== '');
            const wsDoc = npc.waystone_id ? waystoneMap.get(npc.waystone_id) : null;

            itemGroup.sellers.push({
              npcId: npc._id,
              npcName: stripMinecraftColors(npc.name),
              shopId: shop._id,
              shopType: isPlayerShop ? 'PLAYER' : 'SYSTEM',
              ownerUuid: isPlayerShop ? npc.owner_id : null,
              ownerUsername: isPlayerShop
                ? ownerNameMap.get(npc.owner_id) || wsDoc?.owner_name || 'Unknown'
                : null,
              page: Number(pageKey) || 1,
              slot: Number(slotKey) || 0,
              location: npc.location
                ? {
                    world: npc.location.world || 'world',
                    x: Math.round(Number(npc.location.x || 0)),
                    y: Math.round(Number(npc.location.y || 0)),
                    z: Math.round(Number(npc.location.z || 0)),
                    exact: {
                      x: Number(Number(npc.location.x || 0).toFixed(2)),
                      y: Number(Number(npc.location.y || 0).toFixed(2)),
                      z: Number(Number(npc.location.z || 0).toFixed(2)),
                    },
                  }
                : null,
              waystone: wsDoc
                ? {
                    waystoneId: wsDoc.waystone_id,
                    name: stripMinecraftColors(wsDoc.custom_name || 'Lãnh địa'),
                    ownerName: wsDoc.owner_name || 'Unknown',
                    isActive: Boolean(wsDoc.is_active),
                    visitFee: Number(wsDoc.visit_fee || 0),
                    formattedVisitFee: formatCurrency(Number(wsDoc.visit_fee || 0)),
                    location: wsDoc.location || null,
                  }
                : null,
            });
          }
        }
      }
    }

    const items = [...matchedItemsMap.values()].map((entry) => {
      const systemSellersCount = entry.sellers.filter((s) => s.shopType === 'SYSTEM').length;
      const playerSellersCount = entry.sellers.filter((s) => s.shopType === 'PLAYER').length;

      // Ưu tiên NPC Hệ thống lên trước, sau đó tới Waystone đang hoạt động
      const sortedSellers = [...entry.sellers].sort((a, b) => {
        if (a.shopType !== b.shopType) return a.shopType === 'SYSTEM' ? -1 : 1;
        const aActive = a.waystone ? (a.waystone.isActive ? 1 : 0) : 1;
        const bActive = b.waystone ? (b.waystone.isActive ? 1 : 0) : 1;
        return bActive - aActive;
      });

      return {
        itemId: entry.itemId,
        displayName: entry.displayName,
        material: entry.material,
        lore: entry.lore,
        pricing: entry.pricing,
        sellersCount: sortedSellers.length,
        systemSellersCount,
        playerSellersCount,
        locked: !vipStatus.isVip,
        lockMessage: vipStatus.isVip ? null : t('NPC_LOOKUP_VIP_LOCKED', lang),
        sellers: vipStatus.isVip ? sortedSellers : [],
      };
    });

    return {
      isVip: vipStatus.isVip,
      vipTier: vipStatus.vipTier,
      vipExpiresAt: vipStatus.vipExpiresAt,
      query: cleanQuery,
      totalMatchedItems: items.length,
      items,
    };
  }
}

module.exports = new NpcLookupService();