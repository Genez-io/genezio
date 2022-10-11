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
exports.deployCode = exports.getS3Link = void 0;
var path_1 = __importDefault(require("path"));
var form_data_1 = __importDefault(require("form-data"));
var fs_1 = __importDefault(require("fs"));
var axios_1 = __importDefault(require("axios"));
var file_1 = require("../utils/file");
var crypto_1 = __importDefault(require("crypto"));
function getS3Link(archivePath, projectName, className) {
    return __awaiter(this, void 0, void 0, function () {
        var fileBuffer, hashSum, archiveHash, archiveSize, authToken, data;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (!archivePath || !projectName || !className) {
                        throw new Error("Missing required parameters");
                    }
                    fileBuffer = fs_1.default.readFileSync("archivePath");
                    hashSum = crypto_1.default.createHash("sha256");
                    hashSum.update(fileBuffer);
                    archiveHash = hashSum.digest("hex");
                    archiveSize = fs_1.default.statSync(archivePath).size;
                    return [4 /*yield*/, (0, file_1.readToken)()];
                case 1:
                    authToken = _a.sent();
                    return [4 /*yield*/, axios_1.default.post("https://haavwx62n4.execute-api.us-east-1.amazonaws.com/dev/getS3Link", {
                            archiveHash: archiveHash,
                            archiveSize: archiveSize,
                            // projectNAME,
                            // className
                        }, {
                            headers: {
                                Authorization: "Bearer ".concat(authToken)
                            }
                        })];
                case 2:
                    data = (_a.sent()).data;
                    // return s3 link
                    return [2 /*return*/, data.s3Link];
            }
        });
    });
}
exports.getS3Link = getS3Link;
function deployCode(bundledCode, filePath, extension, runtime) {
    var _a, _b;
    return __awaiter(this, void 0, void 0, function () {
        var form, token, response;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    form = new form_data_1.default();
                    return [4 /*yield*/, (0, file_1.readToken)().catch(function () { return undefined; })];
                case 1:
                    token = _c.sent();
                    if (!token) {
                        throw new Error("We are currently in the early access phase of our project. Run 'genezio login <code>' before you deploy your function. If you don't have a code, contact us at contact@genez.io.");
                    }
                    form.append("token", token);
                    form.append("bundledFile", fs_1.default.createReadStream(bundledCode.path));
                    form.append("file", fs_1.default.createReadStream(filePath));
                    form.append("filename", path_1.default.parse(filePath).name);
                    form.append("extension", extension);
                    form.append("runtime", runtime);
                    return [4 /*yield*/, (0, axios_1.default)({
                            method: "post",
                            url: "https://haavwx62n4.execute-api.us-east-1.amazonaws.com/js/deploy",
                            data: form,
                            headers: form.getHeaders()
                        }).catch(function (error) {
                            throw error;
                        })];
                case 2:
                    response = _c.sent();
                    if (response.data.status === "error") {
                        throw new Error(response.data.message);
                    }
                    if ((_b = (_a = response.data) === null || _a === void 0 ? void 0 : _a.error) === null || _b === void 0 ? void 0 : _b.message) {
                        throw new Error(response.data.error.message);
                    }
                    return [2 /*return*/, response.data.functionUrl];
            }
        });
    });
}
exports.deployCode = deployCode;
