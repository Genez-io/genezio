const mongoose = require('mongoose');

const activeSessionSchema = new mongoose.Schema({
  token: {
    type: String,
    required: true,
  },
  userId: {
    type: String,
    required: true,
  },
  date: {
    type: Date,
    required: true,
    default: Date.now,
  },
});

const activeSeesion = mongoose.model('ActiveSession', activeSessionSchema);

module.exports = activeSeesion;