import { User } from "./user.sdk.js"
import { Env, Remote } from "./remote.js"


(async () => {
    Remote.env = Env.Local
    console.log(await User.register("name", "email", "password"))

    console.log(await User.login("email", "password"))
})();


