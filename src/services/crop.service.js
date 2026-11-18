const cropRepo = require('../repositories/crop.repository');

class CropService {
  parseLocation(locStr) {
    if (!locStr || typeof locStr !== 'string') return null;
    const [world, x, y, z] = locStr.split(',');
    return {
      world,
      x: Number(x),
      y: Number(y),
      z: Number(z),
      layer: Number(y) < 50 ? 'UNDERGROUND' : 'SURFACE',
    };
  }

  async getMyCrops(uuid) {
    const doc = await cropRepo.findByUuid(uuid);
    if (!doc || !doc.locations) {
      return { totalPlots: 0, readyCount: 0, plots: [] };
    }

    const now = Date.now();
    const plots = Object.entries(doc.locations).map(([locKey, crop]) => {
      const plantTime = Number(crop.plantTime || 0);
      const reqTime = Number(crop.reqTime || 0);
      const readyAt = plantTime + reqTime;
      const isReady = reqTime > 0 ? now >= readyAt : true;
      const progressPercent =
        reqTime > 0
          ? Math.min(100, Math.max(0, Math.round(((now - plantTime) / reqTime) * 100)))
          : 100;

      return {
        locationKey: locKey,
        coordinates: this.parseLocation(locKey),
        seedId: crop.seedId,
        harvestsLeft: crop.harvestsLeft ?? 0,
        maxHarvests: crop.maxHarvests ?? 1,
        plantTime,
        reqTime,
        readyAt,
        remainingMs: isReady ? 0 : readyAt - now,
        progressPercent,
        isReady,
      };
    });

    return {
      totalPlots: plots.length,
      readyCount: plots.filter((p) => p.isReady).length,
      plots,
    };
  }
}

module.exports = new CropService();