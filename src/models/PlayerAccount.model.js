const mongoose = require('mongoose');

const pendingWebItemSchema = new mongoose.Schema(
  {
    item_id: { type: String, required: true },
    amount: { type: Number, default: 1 },
    created_at: { type: Number, default: () => Date.now() },
  },
  { _id: false }
);

const playerAccountSchema = new mongoose.Schema(
  {
    _id: String, // UUID người chơi
    playerName: String,
    password: String,
    email: String,
    is_vip: { type: Boolean, default: false },
    vip_expires_at: { type: Number, default: 0 },
    max_slots: { type: Number, default: 2 },
    has_unlocked_vip_slot: { type: Boolean, default: false },
    pending_web_items: { type: [pendingWebItemSchema], default: [] },
  },
  { collection: 'player_accounts', strict: false }
);

const MAX_ALLOWED_SLOTS = 10;
const DEFAULT_MAX_SLOTS = 2;

const resolveAccountVipState = (account) => {
  const now = Date.now();
  const rawIsVip = Boolean(account?.is_vip);
  const expiresAt = Number(account?.vip_expires_at || 0);
  const isVip = rawIsVip && (expiresAt === 0 || expiresAt > now);
  const maxSlots = Math.min(
    MAX_ALLOWED_SLOTS,
    Math.max(DEFAULT_MAX_SLOTS, Number(account?.max_slots || DEFAULT_MAX_SLOTS))
  );
  const hasUnlockedVipSlot = Boolean(account?.has_unlocked_vip_slot);

  return {
    isVip,
    vipExpiresAt: isVip ? expiresAt : 0,
    maxSlots,
    hasUnlockedVipSlot,
  };
};

const PlayerAccount = mongoose.model('PlayerAccount', playerAccountSchema);
PlayerAccount.MAX_ALLOWED_SLOTS = MAX_ALLOWED_SLOTS;
PlayerAccount.DEFAULT_MAX_SLOTS = DEFAULT_MAX_SLOTS;
PlayerAccount.resolveAccountVipState = resolveAccountVipState;

module.exports = PlayerAccount;