const { resolveLang, t } = require('./language.util');

class ApiResponse {
  static success(res, data, message = 'SUCCESS', statusCode = 200, params = {}) {
    const lang = resolveLang(res?.req);
    return res.status(statusCode).json({
      success: true,
      message: t(message, lang, params),
      data,
    });
  }

  static error(res, message = 'INTERNAL_ERROR', statusCode = 500, errors = null, params = {}) {
    const lang = resolveLang(res?.req);
    return res.status(statusCode).json({
      success: false,
      message: t(message, lang, params),
      ...(errors && { errors }),
    });
  }
}

module.exports = ApiResponse;