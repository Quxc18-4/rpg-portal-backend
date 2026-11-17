const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const authRepo = require('../repositories/auth.repository');

class AuthService {
  signToken(payload) {
    return jwt.sign(payload, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN || '7d',
    });
  }

  verifyPassword(rawPassword, storedPassword) {
    if (!storedPassword) return false;
    // Khớp 100% với AuthManager.hashPassword() (SHA-256 -> Base64)
    const sha256Base64 = crypto
      .createHash('sha256')
      .update(rawPassword, 'utf8')
      .digest('base64');

    return sha256Base64 === storedPassword;
  }

  async loginWithInGameAccount(username, password) {
    const account = await authRepo.findInGameAccountByUsername(username);
    if (!account) {
      const err = new Error('Tài khoản không tồn tại trong hệ thống');
      err.statusCode = 401;
      throw err;
    }

    const isMatch = this.verifyPassword(password, account.password);
    if (!isMatch) {
      const err = new Error('Mật khẩu không chính xác');
      err.statusCode = 401;
      throw err;
    }

    const uuid = account._id;
    const token = this.signToken({ uuid, username: account.playerName });

    return {
      token,
      user: {
        uuid,
        username: account.playerName,
        email: account.email,
      },
    };
  }

  getDiscordAuthUrl() {
    const params = new URLSearchParams({
      client_id: process.env.DISCORD_CLIENT_ID,
      redirect_uri: process.env.DISCORD_REDIRECT_URI,
      response_type: 'code',
      scope: 'identify',
    });
    return `https://discord.com/api/oauth2/authorize?${params.toString()}`;
  }

  async handleDiscordCallback(code) {
    const tokenRes = await axios.post(
      'https://discord.com/api/oauth2/token',
      new URLSearchParams({
        client_id: process.env.DISCORD_CLIENT_ID,
        client_secret: process.env.DISCORD_CLIENT_SECRET,
        grant_type: 'authorization_code',
        code,
        redirect_uri: process.env.DISCORD_REDIRECT_URI,
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    const userRes = await axios.get('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${tokenRes.data.access_token}` },
    });

    const discordUser = userRes.data;
    const linked = await authRepo.findWebAccountByDiscordId(discordUser.id);

    if (!linked) {
      // Chưa liên kết -> trả về thông tin Discord để Frontend hiện form nhập user/pass in-game 1 lần
      return {
        isLinked: false,
        discordProfile: {
          discordId: discordUser.id,
          discordUsername: discordUser.username,
          discordAvatar: discordUser.avatar,
        },
      };
    }

    const token = this.signToken({ uuid: linked.uuid, username: linked.username });
    return {
      isLinked: true,
      token,
      user: { uuid: linked.uuid, username: linked.username },
    };
  }

  async linkDiscordAccount({ username, password, discordId, discordUsername, discordAvatar }) {
    const { user } = await this.loginWithInGameAccount(username, password);
    await authRepo.linkDiscordToUuid({
      uuid: user.uuid,
      username: user.username,
      discordId,
      discordUsername,
      discordAvatar,
    });

    const token = this.signToken({ uuid: user.uuid, username: user.username });
    return { token, user };
  }
}

module.exports = new AuthService();