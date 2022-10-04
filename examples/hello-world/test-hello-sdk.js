import { HelloWorldClass } from "./sdk/hello.sdk.js"
import { Remote, Env } from "./sdk/remote.js"

(async () => {
    Remote.env = Env.Local
    console.log(await HelloWorldClass.helloWorld())
    console.log(await HelloWorldClass.hello("George", "Tenerife"))
})();
