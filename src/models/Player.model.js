const mongoose = require('mongoose');

const slotCharacterSchema = new mongoose.Schema(
  {
    class: { type: String, default: 'commoner' },
    level: { type: Number, default: 1 },
    resource: { type: Number, default: 100 },
    exp: { type: Number, default: 0 },
    balance: { type: Number, default: 0 },
    attributes: {
      unspent: { type: Number, default: 0 },
      STR: { type: Number, default: 0 },
      INT: { type: Number, default: 0 },
      VIT: { type: Number, default: 0 },
      AGI: { type: Number, default: 0 },
      LUK: { type: Number, default: 0 },
    },
    elements: { type: [String], default: [] },
    trinkets: { type: mongoose.Schema.Types.Mixed, default: {} },
    skills_data: { type: mongoose.Schema.Types.Mixed, default: {} },
    vanilla_inventory: { type: String, default: '' },
    ender_chest: { type: String, default: '' },
  },
  { _id: false, strict: false }
);

const playerSchema = new mongoose.Schema(
  {
    _id: String,
    username: String,
    active_slot: { type: Number, default: 1 },
    last_slot_switch: { type: Number, default: 0 },
    slots: {
      type: Map,
      of: slotCharacterSchema,
      default: {},
    },
  },
  { collection: 'players', strict: false }
);

module.exports = mongoose.model('Player', playerSchema);