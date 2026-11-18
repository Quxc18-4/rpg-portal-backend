const mongoose = require('mongoose');

const webAccountSchema = new mongoose.Schema(
  {
    uuid: { type: String, required: true, unique: true },
    username: { type: String, required: true },
    role: {
      type: String,
      enum: ['GUEST', 'USER', 'MODERATOR', 'ADMIN'],
      default: 'USER',
    },
    discord_id: { type: String, unique: true, sparse: true },
    discord_username: String,
    discord_avatar: String,
  },
  { collection: 'web_accounts', timestamps: true }
);

module.exports = mongoose.model('WebAccount', webAccountSchema);