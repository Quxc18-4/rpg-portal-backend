const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const authRepo = require('./auth.repository');
const PlayerAccount = require('../../models/PlayerAccount.model');
const { AppError } = require('../../utils/error.util');

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

  async buildUserSessionPayload(uuid, fallbackUsername = 'Player') {
    const [account, webAccount] = await Promise.all([
      PlayerAccount.findById(uuid).lean(),
      authRepo.findOrCreateWebAccount(uuid, fallbackUsername),
    ]);

    const username = account?.playerName || webAccount?.username || fallbackUsername;
    const role = webAccount?.role || 'USER';
    const vipState = PlayerAccount.resolveAccountVipState(account);

    const token = this.signToken({ uuid, username, role });

    return {
      token,
      user: {
        uuid,
        username,
        email: account?.email || null,
        role,
        ...vipState,
      },
    };
  }

  async loginWithInGameAccount(username, password) {
    const account = await authRepo.findInGameAccountByUsername(username);
    if (!account) {
      throw AppError.unauthorized('ACCOUNT_NOT_FOUND');
    }

    const isMatch = this.verifyPassword(password, account.password);
    if (!isMatch) {
      throw AppError.unauthorized('INCORRECT_PASSWORD');
    }

    return this.buildUserSessionPayload(account._id, account.playerName);
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
        role: 'GUEST',
        discordProfile: {
          discordId: discordUser.id,
          discordUsername: discordUser.username,
          discordAvatar: discordUser.avatar,
        },
      };
    }

    const session = await this.buildUserSessionPayload(linked.uuid, linked.username);
    return {
      isLinked: true,
      ...session,
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

    return this.buildUserSessionPayload(user.uuid, user.username);
  }
}

module.exports = new AuthService();