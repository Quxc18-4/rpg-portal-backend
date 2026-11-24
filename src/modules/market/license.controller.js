const licenseService = require('./license.service');
const ApiResponse = require('../../utils/apiResponse.util');

class LicenseController {
  async getLicenses(req, res, next) {
    try {
      const viewerUuid = req.user?.uuid || null;
      const { status, onlyMine, q, page, limit } = req.query;
      const data = await licenseService.getLicenses({
        viewerUuid,
        includeFullContributors: false,
        status,
        onlyMine: onlyMine === 'true',
        q,
        page,
        limit,
      });
      return ApiResponse.success(res, data, 'MARKET_LICENSES_SUCCESS');
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new LicenseController();