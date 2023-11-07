import envify from "envify";
import fs from "fs";

if (process.argv.length == 4) {
    process.env.NODE_ENV = process.argv[3];
} else {
    process.env.NODE_ENV = "production";
}
console.log("Environment installed: " + process.env.NODE_ENV);

var data = "";
fs.createReadStream(process.argv[2], { encoding: "utf8" })
    .pipe(envify(process.argv[2]))
    .on("data", (chunk) => {
        data += chunk;
    })
    .on("end", () => {
        fs.writeFileSync(process.argv[2], data);
    });
