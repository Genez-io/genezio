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
exports.readToken = exports.writeToFile = exports.readUTF8File = exports.getFileDetails = exports.createTemporaryFolder = exports.fileExists = exports.zipDirectory = exports.getAllNonJsFiles = void 0;
var assert_1 = require("assert");
var fs_1 = __importDefault(require("fs"));
var os_1 = __importDefault(require("os"));
var path_1 = __importDefault(require("path"));
var fileDetails_1 = __importDefault(require("../models/fileDetails"));
var glob_1 = __importDefault(require("glob"));
var archiver_1 = __importDefault(require("archiver"));
var keytar_1 = __importDefault(require("keytar"));
function getAllNonJsFiles() {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            return [2 /*return*/, new Promise(function (resolve, reject) {
                    (0, glob_1.default)("./**/*", { dot: true }, function (err, files) {
                        if (err) {
                            reject(err);
                        }
                        var fileDetails = files
                            .filter(function (file) {
                            // filter js files, node_modules and folders
                            return (path_1.default.extname(file) !== ".js" &&
                                path_1.default.basename(file) !== "package.json" &&
                                path_1.default.basename(file) !== "package-lock.json" &&
                                !file.includes("node_modules") &&
                                !fs_1.default.lstatSync(file).isDirectory());
                        })
                            .map(function (file) {
                            return {
                                name: path_1.default.parse(file).name,
                                extension: path_1.default.parse(file).ext,
                                path: file,
                                filename: file
                            };
                        });
                        resolve(fileDetails);
                    });
                })];
        });
    });
}
exports.getAllNonJsFiles = getAllNonJsFiles;
function zipDirectory(sourceDir, outPath) {
    return __awaiter(this, void 0, void 0, function () {
        var archive, stream;
        return __generator(this, function (_a) {
            archive = (0, archiver_1.default)("zip", { zlib: { level: 9 } });
            stream = fs_1.default.createWriteStream(outPath);
            return [2 /*return*/, new Promise(function (resolve, reject) {
                    archive
                        .directory(sourceDir, false)
                        .on("error", function (err) { return reject(err); })
                        .pipe(stream);
                    stream.on("close", function () { return resolve(); });
                    archive.finalize();
                })];
        });
    });
}
exports.zipDirectory = zipDirectory;
function fileExists(filePath) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            return [2 /*return*/, new Promise(function (resolve) {
                    fs_1.default.stat(filePath, function (exists) {
                        if (exists == null) {
                            return resolve(true);
                        }
                        else if (exists.code === "ENOENT") {
                            return resolve(false);
                        }
                    });
                })];
        });
    });
}
exports.fileExists = fileExists;
function createTemporaryFolder(name) {
    if (name === void 0) { name = "foo-"; }
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            return [2 /*return*/, new Promise(function (resolve, reject) {
                    fs_1.default.mkdtemp(path_1.default.join(os_1.default.tmpdir(), name), function (error, folder) {
                        if (error) {
                            (0, assert_1.rejects)(error);
                        }
                        resolve(folder);
                    });
                })];
        });
    });
}
exports.createTemporaryFolder = createTemporaryFolder;
function getFileDetails(filePath) {
    var _a = path_1.default.parse(filePath), ext = _a.ext, name = _a.name, dir = _a.dir, base = _a.base;
    return new fileDetails_1.default(name, ext, dir, base);
}
exports.getFileDetails = getFileDetails;
function readUTF8File(filePath) {
    return new Promise(function (resolve, reject) {
        fs_1.default.readFile(filePath, 'utf8', function (error, data) {
            if (error) {
                reject(error);
            }
            resolve(data);
        });
    });
}
exports.readUTF8File = readUTF8File;
function writeToFile(folderPath, filename, content, createPathIfNeeded) {
    if (createPathIfNeeded === void 0) { createPathIfNeeded = false; }
    return new Promise(function (resolve, reject) {
        if (!fs_1.default.existsSync(folderPath) && createPathIfNeeded) {
            fs_1.default.mkdirSync(folderPath);
        }
        fs_1.default.writeFile(path_1.default.join(folderPath, filename), content, function (error) {
            if (error) {
                reject(error);
                return;
            }
            resolve();
        });
    });
}
exports.writeToFile = writeToFile;
function readToken() {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            // get credentials from keytar
            return [2 /*return*/, new Promise(function (resolve, reject) {
                    keytar_1.default
                        .findCredentials("genez.io")
                        .then(function (credentials) {
                        if (credentials.length === 0) {
                            console.log("You are not logged in. Please login first.");
                            reject("No credentials found");
                        }
                        resolve(credentials[0].password);
                    })
                        .catch(function (error) {
                        reject(error);
                    });
                })];
        });
    });
}
exports.readToken = readToken;
