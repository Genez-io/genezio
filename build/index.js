#! /usr/bin/env node
"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
    return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (_) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
var commander_1 = require("commander");
var commands_1 = require("./commands");
var localEnvironment_1 = __importDefault(require("./localEnvironment"));
var chokidar_1 = __importDefault(require("chokidar"));
var path_1 = __importDefault(require("path"));
var open_1 = __importDefault(require("open"));
var strings_1 = require("./utils/strings");
var http_1 = __importDefault(require("http"));
var json_1 = __importDefault(require("body/json"));
var http_terminator_1 = require("http-terminator");
var keytar_1 = __importDefault(require("keytar"));
var program = new commander_1.Command();
program
    .name("genezio")
    .description("CLI to interact with the Genezio infrastructure!")
    .version("0.1.0");
program
    .command("init")
    .description("Initialize a Genezio project.")
    .action(function () { return __awaiter(void 0, void 0, void 0, function () {
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0: return [4 /*yield*/, (0, commands_1.init)()];
            case 1:
                _a.sent();
                return [2 /*return*/];
        }
    });
}); });
program
    .command("login")
    .description("Authenticate with Genezio platform to deploy your code.")
    .action(function (code) { return __awaiter(void 0, void 0, void 0, function () {
    var token, server;
    return __generator(this, function (_a) {
        (0, open_1.default)("https://app.genez.io/cli/login?redirect_url=http://localhost:8000");
        console.log(strings_1.asciiCapybara);
        token = "";
        server = http_1.default.createServer(function (req, res) {
            res.setHeader("Access-Control-Allow-Origin", "*");
            res.setHeader("Access-Control-Allow-Headers", "Content-Type");
            res.setHeader("Access-Control-Allow-Methods", "POST");
            res.setHeader("Access-Control-Allow-Credentials", "true");
            if (req.method === "OPTIONS") {
                res.end();
                return;
            }
            (0, json_1.default)(req, res, function (err, body) {
                token = body.token;
                var name = body.user.name || "genezio-username";
                keytar_1.default.setPassword("genez.io", name, token).then(function () {
                    console.log("Token recieved!");
                    res.setHeader("Access-Control-Allow-Origin", "*");
                    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
                    res.setHeader("Access-Control-Allow-Methods", "POST");
                    res.setHeader("Access-Control-Allow-Credentials", "true");
                    res.writeHead(200);
                    res.end("Token recieved!");
                });
            });
            var httpTerminator = (0, http_terminator_1.createHttpTerminator)({ server: server });
            httpTerminator.terminate();
        });
        server.listen(8000, "localhost", function () {
            console.log("Waiting for token...");
        });
        return [2 /*return*/];
    });
}); });
program
    .command("deploy")
    .description("Deploy the functions mentioned in the genezio.yaml file to Genezio infrastructure.")
    .action(function () { return __awaiter(void 0, void 0, void 0, function () {
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0: return [4 /*yield*/, (0, commands_1.deployFunctions)().catch(function (error) {
                    console.error(error.message);
                })];
            case 1:
                _a.sent();
                return [2 /*return*/];
        }
    });
}); });
program
    .command("generateSdk")
    .argument("<env>", 'The environment used to make requests. Available options: "local" or "production".')
    .description("Generate the SDK.")
    .action(function (env) { return __awaiter(void 0, void 0, void 0, function () {
    var _a;
    return __generator(this, function (_b) {
        switch (_b.label) {
            case 0:
                _a = env;
                switch (_a) {
                    case "local": return [3 /*break*/, 1];
                    case "production": return [3 /*break*/, 3];
                }
                return [3 /*break*/, 5];
            case 1: return [4 /*yield*/, (0, commands_1.generateSdks)(env)
                    .then(function () {
                    console.log("Your SDK was successfully generated!");
                })
                    .catch(function (error) {
                    console.error("".concat(error));
                })];
            case 2:
                _b.sent();
                return [3 /*break*/, 6];
            case 3: return [4 /*yield*/, (0, commands_1.deployFunctions)().catch(function (error) {
                    console.error(error);
                })];
            case 4:
                _b.sent();
                return [3 /*break*/, 6];
            case 5:
                console.error("Wrong env value ".concat(env, ". Available options: \"local\" or \"production\"."));
                _b.label = 6;
            case 6: return [2 /*return*/];
        }
    });
}); });
program
    .command("local")
    .description("Run a local environment for your functions.")
    .action(function () { return __awaiter(void 0, void 0, void 0, function () {
    var server_1, runServer_1, cwd, watchPaths_1, ignoredPaths_1, startWatching;
    return __generator(this, function (_a) {
        try {
            server_1 = new localEnvironment_1.default();
            runServer_1 = function () { return __awaiter(void 0, void 0, void 0, function () {
                var handlers;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0: return [4 /*yield*/, server_1.generateHandlersFromFiles()];
                        case 1:
                            handlers = _a.sent();
                            server_1.start(handlers);
                            return [2 /*return*/];
                    }
                });
            }); };
            runServer_1();
            cwd = process.cwd();
            watchPaths_1 = [path_1.default.join(cwd, "/**/*")];
            ignoredPaths_1 = "**/node_modules/*";
            startWatching = function () {
                chokidar_1.default
                    .watch(watchPaths_1, {
                    ignored: ignoredPaths_1,
                    ignoreInitial: true
                })
                    .on("all", function () { return __awaiter(void 0, void 0, void 0, function () {
                    return __generator(this, function (_a) {
                        switch (_a.label) {
                            case 0:
                                console.clear();
                                console.log("\x1b[36m%s\x1b[0m", "Change detected, reloading...");
                                return [4 /*yield*/, server_1.terminate()];
                            case 1:
                                _a.sent();
                                runServer_1();
                                return [2 /*return*/];
                        }
                    });
                }); });
            };
            startWatching();
        }
        catch (error) {
            console.error("".concat(error));
        }
        return [2 /*return*/];
    });
}); });
program.parse();
