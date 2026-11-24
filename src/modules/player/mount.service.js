const mountRepo = require('./mount.repository');
const { decodeItemStackBase64 } = require('../../utils/itemDecoder.util');

class MountService {
  async getMyMounts(uuid, options = {}) {
    const doc = await mountRepo.findByUuid(uuid);
    if (!doc) {
      return { unlockedSlots: 0, totalMounts: 0, mounts: [] };
    }

    const mountsMap = doc.mounts || {};
    const mounts = Object.entries(mountsMap)
      .map(([slotKey, mount]) => {
        const saddleItems = mount.inventoryBase64
          ? decodeItemStackBase64(mount.inventoryBase64, options)
          : [];

        return {
          slot: Number(slotKey),
          type: mount.type,
          customName: mount.customName,
          tiers: {
            speed: mount.tierSpeed || 0,
            jump: mount.tierJump || 0,
            durability: mount.tierDurability || 0,
            cooldown: mount.tierCooldown || 0,
            storage: mount.tierStorage || 0,
          },
          isDead: (mount.deathTimestamp || 0) > 0,
          deathTimestamp: mount.deathTimestamp || 0,
          saddleStorage: {
            capacity: saddleItems.capacity ?? saddleItems.length,
            usedSlots: saddleItems.length,
            items: saddleItems,
          },
        };
      })
      .sort((a, b) => a.slot - b.slot);

    return {
      unlockedSlots: doc.unlockedSlots || 0,
      totalMounts: mounts.length,
      mounts,
    };
  }
}

module.exports = new MountService();