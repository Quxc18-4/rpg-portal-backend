const mongoose = require('mongoose');

const operatorActionSchema = new mongoose.Schema(
  {
    actorUuid: { type: String, required: true, index: true },
    actorUsername: { type: String, required: true },
    actorRole: {
      type: String,
      enum: ['USER', 'MODERATOR', 'ADMIN', 'SYSTEM'],
      required: true,
    },
    targetUuid: { type: String, required: true, index: true },
    targetUsername: { type: String, required: true },
    action: { type: String, required: true },
    payload: { type: mongoose.Schema.Types.Mixed, default: {} },
    reason: { type: String, default: '' },
    status: {
      type: String,
      enum: ['PENDING', 'PROCESSING', 'EXECUTED', 'FAILED'],
      default: 'PENDING',
      index: true,
    },
    executedAt: { type: Date, default: null },
    errorMessage: { type: String, default: null },
  },
  { collection: 'web_operator_actions', timestamps: true }
);

module.exports = mongoose.model('OperatorAction', operatorActionSchema);