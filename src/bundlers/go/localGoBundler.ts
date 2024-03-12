import path from "path";
import { log } from "../../utils/logging.js";
import { template } from "./localGoMain.js";
import { GoBundler } from "./goBundlerBase.js";
import { BundlerInput } from "../bundler.interface.js";
import { $ } from "execa";
import { UserError } from "../../errors.js";

export class LocalGoBundler extends GoBundler {
    template = template;

    generateErrorReturn(): string {
        return `
            sendError(w, err, JsonRpcMethod)
            return
        `;
    }

    async compile(folderPath: string, input: BundlerInput) {
        // Compile the Go code locally
        const getDependencyResult = $({ cwd: folderPath })
            .sync`go get github.com/Genez-io/genezio_types`;
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
        const result = $({ cwd: folderPath }).sync`go build -o main main.go`;
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

        input.extra = {
            ...input.extra,
            startingCommand: path.join(input.path, "main"),
            commandParameters: [],
        };
    }
}
