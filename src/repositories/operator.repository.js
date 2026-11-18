const WebConfig = require('../models/WebConfig.model');
const OperatorAction = require('../models/OperatorAction.model');
const WebAccount = require('../models/WebAccount.model');

const DEFAULT_MOD_POLICY = {
  _id: 'moderator_policy',
  allowedActions: [
    'WARN_PLAYER',
    'MUTE_PLAYER',
    'KICK_PLAYER',
    'EXTEND_WAYSTONE_TAX',
    'SEND_COMPENSATION',
  ],
  limits: {
    maxMuteMinutes: 1440,
    maxTaxExtendDays: 7,
    maxCompensateCoins: 4096,
  },
};

class OperatorRepository {
  async getModeratorPolicy() {
    const doc = await WebConfig.findById('moderator_policy').lean();
    if (!doc) {
      return WebConfig.findOneAndUpdate(
        { _id: 'moderator_policy' },
        { $setOnInsert: DEFAULT_MOD_POLICY },
        { upsert: true, new: true }
      ).lean();
    }
    return doc;
  }

  async updateModeratorPolicy({ allowedActions, limits, updatedBy }) {
    const updateFields = { updatedBy };
    if (Array.isArray(allowedActions)) updateFields.allowedActions = allowedActions;
    if (limits && typeof limits === 'object') {
      if (limits.maxMuteMinutes !== undefined) {
        updateFields['limits.maxMuteMinutes'] = Number(limits.maxMuteMinutes);
      }
      if (limits.maxTaxExtendDays !== undefined) {
        updateFields['limits.maxTaxExtendDays'] = Number(limits.maxTaxExtendDays);
      }
      if (limits.maxCompensateCoins !== undefined) {
        updateFields['limits.maxCompensateCoins'] = Number(limits.maxCompensateCoins);
      }
    }

    return WebConfig.findOneAndUpdate(
      { _id: 'moderator_policy' },
      { $set: updateFields },
      { upsert: true, new: true }
    ).lean();
  }

  async enqueueAction(data) {
    const action = await OperatorAction.create(data);
    return action.toObject();
  }

  async findActions(filter = {}, limit = 50) {
    return OperatorAction.find(filter)
      .sort({ createdAt: -1 })
      .limit(Math.min(Number(limit) || 50, 200))
      .lean();
  }

  async findStaffAccounts() {
    return WebAccount.find({ role: { $in: ['MODERATOR', 'ADMIN'] } })
      .sort({ role: 1, username: 1 })
      .lean();
  }
}

module.exports = new OperatorRepository();