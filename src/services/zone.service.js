const zoneRepo = require('../repositories/zone.repository');

class ZoneService {
  async getWorldZones() {
    const zones = await zoneRepo.getAllActiveZones();
    return zones.map((z) => ({
      id: z._id,
      configId: z.zone_config_id,
      familyId: z.family_id,
      layer: z.center_location?.y < 50 ? 'UNDERGROUND' : 'SURFACE',
      location: z.center_location,
      radius: z.radius,
      level: z.level,
      state: z.state,
      growthStage: z.growth_stage,
      progress: {
        killed: z.mobs_killed,
        objective: z.kill_objective,
      },
      deadUntil: z.dead_until,
    }));
  }
}

module.exports = new ZoneService();
