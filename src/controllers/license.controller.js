const licenseService = require('../services/license.service');
const ApiResponse = require('../utils/apiResponse.util');

class LicenseController {
  async getLicenses(req, res, next) {
    try {
      const viewerUuid = req.user?.uuid || null;
      const data = await licenseService.getAllLicenses({
        viewerUuid,
        includeFullContributors: false,
      });
      return ApiResponse.success(res, data, 'MARKET_LICENSES_SUCCESS');
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new LicenseController();