import { Remote, Env } from "./sdk/remote.js"
import { MyClass } from "./sdk/module.sdk.js"

(async () => {
    Remote.env = Env.Production
    console.log(await MyClass.testWithArgs("One arg!"))
})();