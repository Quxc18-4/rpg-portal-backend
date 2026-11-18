const ApiResponse = require('./apiResponse.util');
const { resolveLang, t } = require('./language.util');

class AppError extends Error {
  constructor(messageKey, statusCode = 500, errors = null, params = {}) {
    super(messageKey);
    this.name = 'AppError';
    this.messageKey = messageKey;
    this.statusCode = statusCode;
    this.errors = errors;
    this.params = params;
    this.isOperational = true;

    Error.captureStackTrace(this, this.constructor);
  }

  static badRequest(messageKey = 'VALIDATION_ERROR', errors = null, params = {}) {
    return new AppError(messageKey, 400, errors, params);
  }

  static unauthorized(messageKey = 'UNAUTHORIZED', params = {}) {
    return new AppError(messageKey, 401, null, params);
  }

  static forbidden(messageKey = 'FORBIDDEN', params = {}) {
    return new AppError(messageKey, 403, null, params);
  }

  static notFound(messageKey = 'PLAYER_NOT_FOUND', params = {}) {
    return new AppError(messageKey, 404, null, params);
  }

  static conflict(messageKey = 'DUPLICATE_DATA', errors = null, params = {}) {
    return new AppError(messageKey, 409, errors, params);
  }

  static internal(messageKey = 'INTERNAL_ERROR', params = {}) {
    return new AppError(messageKey, 500, null, params);
  }
}

const errorHandler = (err, req, res, next) => {
  const lang = resolveLang(req);

  let statusCode = err.statusCode || 500;
  let messageKey = err.messageKey || err.message || 'INTERNAL_ERROR';
  let errors = err.errors || null;
  const params = err.params || {};

  // 1. Bắt lỗi Validate của Mongoose
  if (err.name === 'ValidationError') {
    statusCode = 400;
    messageKey = 'VALIDATION_ERROR';
    errors = Object.values(err.errors).map((e) => ({
      field: e.path,
      message: e.message,
    }));
  }

  // 2. Bắt lỗi sai kiểu dữ liệu ID của MongoDB
  if (err.name === 'CastError') {
    statusCode = 400;
    messageKey = 'INVALID_ID';
    errors = [{ field: err.path, value: err.value }];
  }

  // 3. Bắt lỗi trùng khóa Unique (E11000)
  if (err.code === 11000) {
    statusCode = 409;
    messageKey = 'DUPLICATE_DATA';
    const fields = Object.keys(err.keyValue || {});
    errors = fields.map((field) => ({
      field,
      value: err.keyValue[field],
    }));
  }

  // 4. Bắt lỗi JWT
  if (err.name === 'JsonWebTokenError') {
    statusCode = 401;
    messageKey = 'INVALID_TOKEN';
  }
  if (err.name === 'TokenExpiredError') {
    statusCode = 401;
    messageKey = 'TOKEN_EXPIRED';
  }

  // Log stack trace nếu là lỗi hệ thống chưa lường trước (500)
  if (statusCode >= 500) {
    console.error('[ServerError]', err);
    if (process.env.NODE_ENV === 'production' && !err.isOperational) {
      messageKey = 'INTERNAL_ERROR';
    }
  }

  const translatedMessage = t(messageKey, lang, params);
  return ApiResponse.error(res, translatedMessage, statusCode, errors);
};

module.exports = {
  AppError,
  errorHandler,
};