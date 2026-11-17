const mongoose = require('mongoose');

const zoneSchema = new mongoose.Schema(
  {
    _id: String,
    center_location: {
      world: String,
      x: Number,
      y: Number,
      z: Number,
    },
    zone_config_id: String,
    family_id: String,
    radius: Number,
    kill_objective: Number,
    level: Number,
    state: String,
    dead_until: Number,
    mobs_killed: Number,
    growth_stage: Number,
    last_attacked_time: Number,
    boss_uuid: String,
  },
  { collection: 'world_zones', strict: false }
);

module.exports = mongoose.model('Zone', zoneSchema);
