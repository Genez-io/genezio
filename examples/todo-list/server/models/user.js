const mongoose = require('mongoose');
const userSchema = new mongoose.Schema({
    name: String,
    email: String,
    password: String
  });

export const UserModel = mongoose.model('User', userSchema);
