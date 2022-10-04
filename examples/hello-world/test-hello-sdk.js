import { HelloWorldClass } from "./sdk/hello.sdk.js"

(async () => {
    console.log(await HelloWorldClass.helloWorld())
    console.log(await HelloWorldClass.hello("George", "Tenerife"))
})();
