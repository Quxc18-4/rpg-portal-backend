const { getMinecraftServerStatus } = require('../../utils/minecraftPing.util');
const ApiResponse = require('../../utils/apiResponse.util');

class ServerStatusController {
  async getStatus(req, res, next) {
    try {
      const force = req.query.refresh === 'true';
      const data = await getMinecraftServerStatus(force);
      return ApiResponse.success(res, data, 'SERVER_STATUS_SUCCESS');
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new ServerStatusController();