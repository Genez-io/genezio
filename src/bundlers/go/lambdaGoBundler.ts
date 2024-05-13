import { GoBundler } from "./goBundlerBase.js";
import { template } from "./lambdaGoMain.js";
import { log } from "../../utils/logging.js";
import { $ } from "execa";
import { BundlerInput } from "../bundler.interface.js";
import { UserError } from "../../errors.js";

export class LambdaGoBundler extends GoBundler {
    template = template;

    protected generateErrorReturn(): string {
        return `
            errorResponse := sendError(err, JsonRpcMethod)
            return errorResponse, nil
        `;
    }

    async compile(folderPath: string, _: BundlerInput) {
        // Compile the Go code locally
        const dependencies = [
            "github.com/aws/aws-lambda-go/lambda",
            "github.com/Genez-io/genezio_types",
            "github.com/Genez-io/auth",
        ];
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
        process.env["GOARCH"] = "arm64";
        const result = $({
            cwd: folderPath,
            env: {
                ...process.env,
            },
        }).sync`go build -o bootstrap main.go`;
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
