const jobService = require('../services/job.service');
const ApiResponse = require('../utils/apiResponse.util');

class JobController {
  async getMyJobs(req, res, next) {
    try {
      const data = await jobService.getMyJobs(req.user.uuid);
      return ApiResponse.success(res, data, 'JOBS_SUCCESS');
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new JobController();