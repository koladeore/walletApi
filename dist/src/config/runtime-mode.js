"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.workersEnabled = workersEnabled;
exports.apiEnabled = apiEnabled;
require("dotenv/config");
function workersEnabled() {
    return (process.env.APP_MODE ?? 'combined').trim() !== 'api';
}
function apiEnabled() {
    return (process.env.APP_MODE ?? 'combined').trim() !== 'worker';
}
//# sourceMappingURL=runtime-mode.js.map