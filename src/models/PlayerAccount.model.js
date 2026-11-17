const mongoose = require('mongoose');

const playerAccountSchema = new mongoose.Schema(
  {
    _id: String, // UUID người chơi
    playerName: String,
    password: String,
    email: String,
  },
  { collection: 'player_accounts', strict: false }
);

module.exports = mongoose.model('PlayerAccount', playerAccountSchema);