const denRepo = require('./den.repository');
const safezoneService = require('./safezone.service');

class DenService {
  async getDens({ includeExpired = false } = {}) {
    const [rawDens, { safezones }] = await Promise.all([
      denRepo.findAll(),
      safezoneService.getAllSafezones(),
    ]);

    const now = Date.now();

    const formatted = rawDens.map((d) => {
      const loc = d.center_location || {};
      const world = loc.world || 'world';
      const x = Number(loc.x ?? 0);
      const y = Number(loc.y ?? 64);
      const z = Number(loc.z ?? 0);

      const expiresAtMs = d.expires_at ? new Date(d.expires_at).getTime() : 0;
      const isExpired = expiresAtMs > 0 && now > expiresAtMs;
      const distanceFromMainCity = safezoneService.getShortestDistanceToMainSafezone(
        world,
        x,
        z,
        safezones
      );

      return {
        id: d._id,
        tier: d.tier || 'SMALL',
        state: d.state || 'IDLE',
        mobType: d.mob_type || null,
        level: Number(d.level ?? 1),
        isRift: Boolean(d.is_rift),
        world,
        coordinates: { x, y, z },
        distanceFromMainCity,
        createdAt: Number(d.created_at ?? 0),
        expiresAt: d.expires_at || null,
        remainingMs: Math.max(0, expiresAtMs - now),
        isExpired,
      };
    });

    const dens = includeExpired ? formatted : formatted.filter((d) => !d.isExpired);

    return {
      total: dens.length,
      riftsCount: dens.filter((d) => d.isRift).length,
      expiredCount: formatted.filter((d) => d.isExpired).length,
      dens,
    };
  }
}

module.exports = new DenService();