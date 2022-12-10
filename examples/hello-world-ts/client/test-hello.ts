import { HelloWorld, Season } from "./sdk/hello.sdk"

(async () => {
    console.log(await HelloWorld.hello("George", "Tenerife", Season.Winter))
})()