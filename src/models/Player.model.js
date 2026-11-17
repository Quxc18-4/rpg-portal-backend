const mongoose = require('mongoose');

const playerSchema = new mongoose.Schema(
  {
    _id: String,
    username: String,
    class: String,
    level: Number,
    resource: Number,
    exp: Number,
    balance: Number,
    attributes: {
      unspent: Number,
      STR: Number,
      INT: Number,
      VIT: Number,
      AGI: Number,
      LUK: Number,
    },
    elements: [String],
    trinkets: mongoose.Schema.Types.Mixed,
    skills_data: mongoose.Schema.Types.Mixed,
    vanilla_inventory: String,
    ender_chest: String,
  },
  { collection: 'players', strict: false }
);

module.exports = mongoose.model('Player', playerSchema);
