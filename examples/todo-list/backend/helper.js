const ActiveSession = require("./models/activeSession");

async function reqAuth(token) {
  const session = await ActiveSession.find({ token: token });
  if (session.length == 1) {
    return { success: true };
  } else {
    return { success: false, msg: "User is not logged on" };
  }
}

module.exports = {
  reqAuth: reqAuth,
  MONGO_DB_URI: "mongodb+srv://admincluster:pBOmjY56WaN4pSer@cluster0.l5yageu.mongodb.net/?retryWrites=true&w=majority"
};
