const mountService = require('./mount.service');
const ApiResponse = require('../../utils/apiResponse.util');

class MountController {
  async getMyMounts(req, res, next) {
    try {
      const includeRaw = req.query.raw === 'true';
      const data = await mountService.getMyMounts(req.user.uuid, { includeRaw });
      return ApiResponse.success(res, data, 'MOUNTS_SUCCESS');
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new MountController();