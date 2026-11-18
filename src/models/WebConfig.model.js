const mongoose = require('mongoose');

const webConfigSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true }, // VD: 'moderator_policy'
    allowedActions: {
      type: [String],
      default: [
        'WARN_PLAYER',
        'MUTE_PLAYER',
        'KICK_PLAYER',
        'EXTEND_WAYSTONE_TAX',
        'SEND_COMPENSATION',
      ],
    },
    limits: {
      maxMuteMinutes: { type: Number, default: 1440 },
      maxTaxExtendDays: { type: Number, default: 7 },
      maxCompensateCoins: { type: Number, default: 4096 },
    },
    updatedBy: { type: String, default: null },
  },
  { collection: 'web_configs', timestamps: true }
);

module.exports = mongoose.model('WebConfig', webConfigSchema);