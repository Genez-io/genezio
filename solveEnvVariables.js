var envify = require("envify")
    , fs = require('fs')

var data = ""
fs.createReadStream(process.argv[2], { encoding: 'utf8' })
    .pipe(envify(process.argv[2]))
    .on("data", (chunk) => {
        data += chunk
    })
    .on("end", () => {
        fs.writeFileSync(process.argv[2], data)
    })