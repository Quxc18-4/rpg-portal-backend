const ApiResponse = require('../utils/apiResponse.util');

const errorHandler = (err, req, res, next) => {
  console.error('[API Error]', err);
  const statusCode = err.statusCode || 500;
  const message = err.message || 'Internal Server Error';
  return ApiResponse.error(res, message, statusCode);
};

module.exports = errorHandler;
