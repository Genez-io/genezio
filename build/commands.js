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
exports.init = exports.generateSdks = exports.deployFunctions = exports.bundleJavascriptCode = void 0;
var webpack_1 = __importDefault(require("webpack"));
var path_1 = __importDefault(require("path"));
var deployCode_1 = __importDefault(require("./requests/deployCode"));
var generateSdk_1 = __importDefault(require("./requests/generateSdk"));
var file_1 = require("./utils/file");
var prompt_1 = require("./utils/prompt");
var bundledCode_1 = __importDefault(require("./models/bundledCode"));
var yaml_1 = require("yaml");
function bundleJavascriptCode(filePath) {
    return __awaiter(this, void 0, void 0, function () {
        var _this = this;
        return __generator(this, function (_a) {
            return [2 /*return*/, new Promise(function (resolve, reject) { return __awaiter(_this, void 0, void 0, function () {
                    var name, outputFile, temporaryFolder, compiler;
                    return __generator(this, function (_a) {
                        switch (_a.label) {
                            case 0:
                                name = (0, file_1.getFileDetails)(filePath).name;
                                outputFile = "".concat(name, "-processed.js");
                                return [4 /*yield*/, (0, file_1.createTemporaryFolder)(filePath)];
                            case 1:
                                temporaryFolder = _a.sent();
                                compiler = (0, webpack_1.default)({
                                    entry: "./" + filePath,
                                    target: 'node',
                                    mode: 'production',
                                    node: false,
                                    optimization: {
                                        minimize: false,
                                    },
                                    module: {
                                        rules: [
                                            {
                                                test: /\.html$/,
                                                loader: 'dumb-loader',
                                                exclude: /really\.html/
                                            }
                                        ]
                                    },
                                    output: {
                                        path: temporaryFolder,
                                        filename: outputFile,
                                        library: 'genezio',
                                        libraryTarget: 'commonjs'
                                    },
                                });
                                compiler.run(function (error, stats) {
                                    if (error) {
                                        reject(error);
                                        return;
                                    }
                                    if (stats === null || stats === void 0 ? void 0 : stats.hasErrors()) {
                                        reject(stats === null || stats === void 0 ? void 0 : stats.compilation.getErrors());
                                        return;
                                    }
                                    var filePath = path_1.default.join(temporaryFolder, outputFile);
                                    var module = require(filePath);
                                    var className = Object.keys(module.genezio)[0];
                                    var functionNames = Object.getOwnPropertyNames(module.genezio[className].prototype).filter(function (x) { return x !== 'constructor'; });
                                    resolve(new bundledCode_1.default(filePath, className, functionNames));
                                    compiler.close(function (closeErr) { });
                                });
                                return [2 /*return*/];
                        }
                    });
                }); })];
        });
    });
}
exports.bundleJavascriptCode = bundleJavascriptCode;
function deployFunction(filePath, language, sdkPath, runtime) {
    return __awaiter(this, void 0, void 0, function () {
        var _a, name, extension, filename, _b, bundledJavascriptCode, functionUrl;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, (0, file_1.fileExists)(filePath)];
                case 1:
                    if (!(_c.sent())) {
                        throw new Error("File ".concat(filePath, " does not exist!"));
                    }
                    _a = (0, file_1.getFileDetails)(filePath), name = _a.name, extension = _a.extension, filename = _a.filename;
                    _b = extension;
                    switch (_b) {
                        case ".js": return [3 /*break*/, 2];
                    }
                    return [3 /*break*/, 5];
                case 2: return [4 /*yield*/, bundleJavascriptCode(filePath)];
                case 3:
                    bundledJavascriptCode = _c.sent();
                    return [4 /*yield*/, (0, deployCode_1.default)(bundledJavascriptCode, filePath, extension, runtime)];
                case 4:
                    functionUrl = _c.sent();
                    if (!functionUrl) {
                        console.error("A problem occured while contacting Genezio servers. Check your internet connection and try again!");
                        return [2 /*return*/];
                    }
                    return [2 /*return*/, functionUrl];
                case 5: throw new Error("Language represented by extension ".concat(extension, " is not supported!"));
            }
        });
    });
}
function deployFunctions() {
    return __awaiter(this, void 0, void 0, function () {
        var configurationFileContentUTF8, configurationFileContent, functionUrlForFilePath, _i, _a, filePath, functionUrl;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0: return [4 /*yield*/, (0, file_1.readUTF8File)('./genezio.yaml')];
                case 1:
                    configurationFileContentUTF8 = _b.sent();
                    return [4 /*yield*/, (0, yaml_1.parse)(configurationFileContentUTF8)];
                case 2:
                    configurationFileContent = _b.sent();
                    functionUrlForFilePath = {};
                    _i = 0, _a = configurationFileContent.classPaths;
                    _b.label = 3;
                case 3:
                    if (!(_i < _a.length)) return [3 /*break*/, 6];
                    filePath = _a[_i];
                    return [4 /*yield*/, deployFunction(filePath, configurationFileContent.sdk.language, configurationFileContent.sdk.path, configurationFileContent.sdk.runtime)];
                case 4:
                    functionUrl = _b.sent();
                    functionUrlForFilePath[path_1.default.parse(filePath).name] = functionUrl;
                    _b.label = 5;
                case 5:
                    _i++;
                    return [3 /*break*/, 3];
                case 6: return [4 /*yield*/, generateSdks(functionUrlForFilePath)];
                case 7:
                    _b.sent();
                    console.log('Your code was deployed and the SDK was successfully generated!');
                    return [2 /*return*/];
            }
        });
    });
}
exports.deployFunctions = deployFunctions;
function generateSdks(urlMap) {
    return __awaiter(this, void 0, void 0, function () {
        var configurationFileContentUTF8, configurationFileContent, outputPath, sdk, _i, _a, classFile;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0: return [4 /*yield*/, (0, file_1.readUTF8File)('./genezio.yaml')];
                case 1:
                    configurationFileContentUTF8 = _b.sent();
                    return [4 /*yield*/, (0, yaml_1.parse)(configurationFileContentUTF8)];
                case 2:
                    configurationFileContent = _b.sent();
                    outputPath = configurationFileContent.sdk.path;
                    return [4 /*yield*/, (0, generateSdk_1.default)(configurationFileContent.classPaths, configurationFileContent.sdk.runtime, urlMap)];
                case 3:
                    sdk = _b.sent();
                    if (!sdk.remoteFile) return [3 /*break*/, 5];
                    return [4 /*yield*/, (0, file_1.writeToFile)(outputPath, 'remote.js', sdk.remoteFile, true)
                            .catch(function (error) {
                            console.error(error.toString());
                        })];
                case 4:
                    _b.sent();
                    _b.label = 5;
                case 5:
                    _i = 0, _a = sdk.classFiles;
                    _b.label = 6;
                case 6:
                    if (!(_i < _a.length)) return [3 /*break*/, 9];
                    classFile = _a[_i];
                    return [4 /*yield*/, (0, file_1.writeToFile)(outputPath, "".concat(classFile.filename, ".sdk.js"), classFile.implementation, true)
                            .catch(function (error) {
                            console.error(error.toString());
                        })];
                case 7:
                    _b.sent();
                    _b.label = 8;
                case 8:
                    _i++;
                    return [3 /*break*/, 6];
                case 9: return [2 /*return*/];
            }
        });
    });
}
exports.generateSdks = generateSdks;
function init() {
    return __awaiter(this, void 0, void 0, function () {
        var projectName, sdk, language, runtime, path, doc, yamlConfigurationFileContent;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, prompt_1.askQuestion)("What is the name of the project: ")];
                case 1:
                    projectName = _a.sent();
                    sdk = { name: projectName, sdk: {}, classPaths: [] };
                    return [4 /*yield*/, (0, prompt_1.askQuestion)("In what programming language do you want your SDK? [js]: ", 'js')];
                case 2:
                    language = _a.sent();
                    if (language !== "js") {
                        throw Error("We don't currently support this language ".concat(language, "."));
                    }
                    sdk.sdk.language = language;
                    if (!(language === "js")) return [3 /*break*/, 4];
                    return [4 /*yield*/, (0, prompt_1.askQuestion)("What runtime will you use? Options: \"node\" or \"browser\". [node]: ", 'node')];
                case 3:
                    runtime = _a.sent();
                    if (runtime !== "node" && runtime !== "browser") {
                        throw Error("We don't currently support this JS runtime ".concat(runtime, "."));
                    }
                    sdk.sdk.runtime = runtime;
                    _a.label = 4;
                case 4: return [4 /*yield*/, (0, prompt_1.askQuestion)("Where do you want to save your SDK? [./sdk/]: ", './sdk/')];
                case 5:
                    path = _a.sent();
                    sdk.sdk.path = path;
                    doc = new yaml_1.Document(sdk);
                    doc.commentBefore = "File that configures what classes will be deployed in Genezio Infrastructure. \nAdd the paths to classes that you want to deploy in \"classPaths\".\n\nExample:\n\nname: hello-world\nsdk:\n  language: js\n  runtime: node\n  path: ./sdk/\nclassPaths:\n  - \"./hello-world/index.js\"";
                    yamlConfigurationFileContent = doc.toString();
                    return [4 /*yield*/, (0, file_1.writeToFile)('.', 'genezio.yaml', yamlConfigurationFileContent)
                            .catch(function (error) {
                            console.error(error.toString());
                        })];
                case 6:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
exports.init = init;
