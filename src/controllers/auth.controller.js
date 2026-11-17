const authService = require('../services/auth.service');
const ApiResponse = require('../utils/apiResponse.util');

class AuthController {
  async login(req, res, next) {
    try {
      const { username, password } = req.body;
      if (!username || !password) {
        return ApiResponse.error(res, 'Vui lòng nhập đầy đủ username và password', 400);
      }
      const result = await authService.loginWithInGameAccount(username, password);
      return ApiResponse.success(res, result, 'Đăng nhập thành công');
    } catch (error) {
      next(error);
    }
  }

  discordRedirect(req, res) {
    return res.redirect(authService.getDiscordAuthUrl());
  }

  async discordCallback(req, res, next) {
    try {
      const { code } = req.query;
      if (!code) return ApiResponse.error(res, 'Thiếu mã xác thực Discord', 400);

      const result = await authService.handleDiscordCallback(code);
      return ApiResponse.success(res, result);
    } catch (error) {
      next(error);
    }
  }

  async linkDiscord(req, res, next) {
    try {
      const result = await authService.linkDiscordAccount(req.body);
      return ApiResponse.success(res, result, 'Liên kết tài khoản Discord thành công');
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new AuthController();