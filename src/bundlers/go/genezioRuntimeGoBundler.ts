import { log } from "../../utils/logging.js";
import { template } from "./genezioRuntimeGoMain.js";
import { GoBundler } from "./goBundlerBase.js";
import { BundlerInput } from "../bundler.interface.js";
import { $ } from "execa";
import { UserError } from "../../errors.js";

export class GenezioRuntimeGoBundler extends GoBundler {
    template = template;

    generateErrorReturn(): string {
        return `
            sendError(w, err, JsonRpcMethod)
            return
        `;
    }

    async compile(folderPath: string, _: BundlerInput) {
        // Compile the Go code locally
        const dependencies = ["github.com/Genez-io/genezio_types", "github.com/Genez-io/auth"];
        for (const dependency of dependencies) {
            const getDependencyResult = $({ cwd: folderPath }).sync`go get ${dependency}`;
            if (getDependencyResult.exitCode == null) {
                log.info(
                    "There was an error while running the go script, make sure you have the correct permissions.",
                );
                throw new UserError("Compilation error! Please check your code and try again.");
            } else if (getDependencyResult.exitCode != 0) {
                log.info(getDependencyResult.stderr.toString());
                log.info(getDependencyResult.stdout.toString());
                throw new UserError("Compilation error! Please check your code and try again.");
            }
        }
        process.env["GOOS"] = "linux";
        process.env["GOARCH"] = "amd64";
        process.env["CGO_ENABLED"] = "1";
        if (process.platform !== "linux") {
            process.env["CC"] = "x86_64-linux-musl-gcc";
            process.env["CXX"] = "x86_64-linux-musl-g++";
        }
        const result = $({
            cwd: folderPath,
            env: {
                ...process.env,
            },
        }).sync`go build -buildmode=plugin -o bootstrap main.go`;
        if (result.exitCode == null) {
            log.info(
                "There was an error while running the go script, make sure you have the correct permissions.",
            );
            throw new UserError("Compilation error! Please check your code and try again.");
        } else if (result.exitCode != 0) {
            log.info(result.stderr.toString());
            log.info(result.stdout.toString());
            throw new UserError("Compilation error! Please check your code and try again.");
        }
    }
}
