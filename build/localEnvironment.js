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
var commands_1 = require("./commands");
var http_1 = __importDefault(require("http"));
var handler_1 = __importDefault(require("./models/handler"));
var file_1 = require("./utils/file");
var yaml_1 = require("yaml");
var http_terminator_1 = require("http-terminator");
var Server = /** @class */ (function () {
    function Server() {
        this.server = http_1.default.createServer();
    }
    Server.prototype.generateHandlersFromFiles = function () {
        return __awaiter(this, void 0, void 0, function () {
            var handlers, configurationFileContentUTF8, configurationFileContent, _loop_1, _i, _a, file;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        handlers = [];
                        return [4 /*yield*/, (0, file_1.readUTF8File)("./genezio.yaml")];
                    case 1:
                        configurationFileContentUTF8 = _b.sent();
                        return [4 /*yield*/, (0, yaml_1.parse)(configurationFileContentUTF8)];
                    case 2:
                        configurationFileContent = _b.sent();
                        _loop_1 = function (file) {
                            var _c, path, className, functionNames, module_1, object;
                            return __generator(this, function (_d) {
                                switch (_d.label) {
                                    case 0: return [4 /*yield*/, (0, commands_1.bundleJavascriptCode)(file)];
                                    case 1:
                                        _c = _d.sent(), path = _c.path, className = _c.className, functionNames = _c.functionNames;
                                        module_1 = require(path);
                                        object = new module_1.genezio[className]();
                                        functionNames.forEach(function (functionName) {
                                            handlers.push(new handler_1.default(path, object, className, functionName));
                                        });
                                        return [2 /*return*/];
                                }
                            });
                        };
                        _i = 0, _a = configurationFileContent.classPaths;
                        _b.label = 3;
                    case 3:
                        if (!(_i < _a.length)) return [3 /*break*/, 6];
                        file = _a[_i];
                        return [5 /*yield**/, _loop_1(file)];
                    case 4:
                        _b.sent();
                        _b.label = 5;
                    case 5:
                        _i++;
                        return [3 /*break*/, 3];
                    case 6: return [2 /*return*/, handlers];
                }
            });
        });
    };
    Server.prototype.start = function (handlers) {
        return __awaiter(this, void 0, void 0, function () {
            var requestListener;
            return __generator(this, function (_a) {
                if (handlers.length === 0) {
                    console.log("No class registered. Make sure that you have set the classes that you want to deploy in the genezio.yaml configuration file.");
                    return [2 /*return*/];
                }
                requestListener = function (request, response, handlers) {
                    return __awaiter(this, void 0, void 0, function () {
                        var body;
                        return __generator(this, function (_a) {
                            body = "";
                            if (request.method === "OPTIONS") {
                                response.setHeader("Access-Control-Allow-Origin", "*");
                                response.setHeader("Access-Control-Allow-Headers", "Content-Type");
                                response.setHeader("Access-Control-Allow-Methods", "POST");
                                response.end();
                                return [2 /*return*/];
                            }
                            request.on("data", function (data) {
                                body += data;
                            });
                            request.on("end", function () {
                                return __awaiter(this, void 0, void 0, function () {
                                    var jsonRpcRequest, components, responseData_1, className, method, handler, responseData_2, functionName, responseData, functionResponse, error_1;
                                    var _a;
                                    return __generator(this, function (_b) {
                                        switch (_b.label) {
                                            case 0:
                                                jsonRpcRequest = JSON.parse(body);
                                                components = jsonRpcRequest.method.split(".");
                                                if (components.length !== 2) {
                                                    response.writeHead(404);
                                                    responseData_1 = {
                                                        jsonrpc: "2.0",
                                                        error: { code: -32601, message: "Wrong method format" },
                                                        id: jsonRpcRequest.id
                                                    };
                                                    response.end(responseData_1);
                                                    return [2 /*return*/];
                                                }
                                                className = components[0], method = components[1];
                                                console.log("Receive call on function ".concat(jsonRpcRequest.method));
                                                handler = handlers.find(function (handler) {
                                                    return handler.className === className && handler.functionName === method;
                                                });
                                                if (!handler) {
                                                    response.writeHead(404);
                                                    responseData_2 = {
                                                        jsonrpc: "2.0",
                                                        error: { code: -32601, message: "Method not found" },
                                                        id: jsonRpcRequest.id
                                                    };
                                                    response.end(responseData_2);
                                                    return [2 /*return*/];
                                                }
                                                functionName = handler.functionName;
                                                responseData = undefined;
                                                _b.label = 1;
                                            case 1:
                                                _b.trys.push([1, 3, , 4]);
                                                return [4 /*yield*/, (_a = handler.object)[functionName].apply(_a, jsonRpcRequest.params)];
                                            case 2:
                                                functionResponse = _b.sent();
                                                responseData = {
                                                    jsonrpc: "2.0",
                                                    result: functionResponse,
                                                    error: null,
                                                    id: jsonRpcRequest.id
                                                };
                                                return [3 /*break*/, 4];
                                            case 3:
                                                error_1 = _b.sent();
                                                console.error("An error occured:", error_1.toString());
                                                responseData = {
                                                    jsonrpc: "2.0",
                                                    error: { code: -1, message: error_1.toString() },
                                                    id: jsonRpcRequest.id
                                                };
                                                return [3 /*break*/, 4];
                                            case 4:
                                                response.setHeader("Access-Control-Allow-Origin", "*");
                                                response.setHeader("Access-Control-Allow-Headers", "Content-Type");
                                                response.setHeader("Access-Control-Allow-Methods", "POST");
                                                response.writeHead(200);
                                                response.end(JSON.stringify(responseData));
                                                return [2 /*return*/];
                                        }
                                    });
                                });
                            });
                            return [2 /*return*/];
                        });
                    });
                };
                this.server = http_1.default.createServer(function (req, res) {
                    return requestListener(req, res, handlers);
                });
                console.log("Functions registered:");
                handlers.forEach(function (handler) {
                    console.log("  - ".concat(handler.className, ".").concat(handler.functionName));
                });
                console.log("");
                console.log("Listening for requests...");
                this.server.listen(8083);
                return [2 /*return*/];
            });
        });
    };
    Server.prototype.terminate = function () {
        return __awaiter(this, void 0, void 0, function () {
            var httpTerminator;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        httpTerminator = (0, http_terminator_1.createHttpTerminator)({ server: this.server });
                        return [4 /*yield*/, httpTerminator.terminate()];
                    case 1:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        });
    };
    return Server;
}());
exports.default = Server;
