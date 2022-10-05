ActiveSession = require("./models/activeSession");

async function reqAuth(token) {
  const session = await ActiveSession.find({ token: token });
  if (session.length == 1) {
    return { success: true };
  } else {
    return { success: false, msg: "User is not logged on" };
  }
}

module.exports = {
  reqAuth: reqAuth
};
