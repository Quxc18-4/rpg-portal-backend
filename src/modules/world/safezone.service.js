const safezoneRepo = require('./safezone.repository');

class SafezoneService {
  formatMinecraftName(rawId) {
    return String(rawId || '')
      .replace(/&[0-9a-fk-or]/gi, '')
      .replace(/_/g, ' ')
      .trim();
  }

  formatSafezone(sz) {
    return {
      id: sz._id,
      displayName: this.formatMinecraftName(sz._id),
      type: sz.is_outpost ? 'OUTPOST' : 'MAIN_CITY',
      isOutpost: Boolean(sz.is_outpost),
      world: sz.world || 'world',
      coordinates: {
        x: Number(sz.x ?? 0),
        y: Number(sz.y ?? 64),
        z: Number(sz.z ?? 0),
      },
      radius: Number(sz.radius ?? 50),
    };
  }

  async getAllSafezones() {
    const docs = await safezoneRepo.findAll();
    const safezones = docs.map((sz) => this.formatSafezone(sz));

    return {
      total: safezones.length,
      mainCitiesCount: safezones.filter((s) => !s.isOutpost).length,
      outpostsCount: safezones.filter((s) => s.isOutpost).length,
      safezones,
    };
  }

  getShortestDistanceToMainSafezone(world, x, z, formattedSafezones = []) {
    const mainCities = formattedSafezones.filter((sz) => !sz.isOutpost && sz.world === world);
    if (mainCities.length === 0) {
      return Math.round(Math.hypot(x, z) * 10) / 10;
    }

    let minDist = Infinity;
    for (const city of mainCities) {
      const distToCenter = Math.hypot(x - city.coordinates.x, z - city.coordinates.z);
      const distFromEdge = Math.max(0, distToCenter - city.radius);
      if (distFromEdge < minDist) {
        minDist = distFromEdge;
      }
    }
    return Math.round(minDist * 10) / 10;
  }

  calculateVoronoiBaseLevel(distance) {
    if (distance <= 0) return 1;
    return Math.floor(Math.sqrt(distance) * 0.58) + 1;
  }

  calculateBountyDistanceMultiplier(distance) {
    if (distance > 6000) return 2.0;
    if (distance > 3000) return 1.5;
    return 1.0;
  }
}

module.exports = new SafezoneService();