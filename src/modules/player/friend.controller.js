const friendService = require('./friend.service');
const ApiResponse = require('../../utils/apiResponse.util');

class FriendController {
  async getMyFriends(req, res, next) {
    try {
      const data = await friendService.getMyFriends(req.user.uuid);
      return ApiResponse.success(res, data, 'PLAYER_FRIENDS_SUCCESS');
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new FriendController();