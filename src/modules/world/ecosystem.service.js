const ecosystemRepo = require('./ecosystem.repository');
const safezoneService = require('./safezone.service');

class EcosystemService {
  async getAllEcosystems() {
    const docs = await ecosystemRepo.findAll();

    const ecosystems = docs.map((eco) => {
      const populations = eco.populations || {};
      const totalPopulation = Object.values(populations).reduce(
        (sum, count) => sum + (Number(count) || 0),
        0
      );

      return {
        id: eco._id,
        displayName: safezoneService.formatMinecraftName(eco._id),
        isExtinct: Boolean(eco.is_extinct),
        extinctSince: Number(eco.extinct_since ?? 0),
        totalPopulation,
        populations,
      };
    });

    return {
      total: ecosystems.length,
      extinctCount: ecosystems.filter((e) => e.isExtinct).length,
      ecosystems,
    };
  }
}

module.exports = new EcosystemService();