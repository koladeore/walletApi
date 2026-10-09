"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LimitsModule = void 0;
const common_1 = require("@nestjs/common");
const security_module_1 = require("../security/security.module");
const limits_service_1 = require("./limits.service");
const limits_controller_1 = require("./limits.controller");
let LimitsModule = class LimitsModule {
};
exports.LimitsModule = LimitsModule;
exports.LimitsModule = LimitsModule = __decorate([
    (0, common_1.Module)({
        imports: [security_module_1.SecurityModule],
        providers: [limits_service_1.LimitsService],
        controllers: [limits_controller_1.LimitsController, limits_controller_1.AdminLimitsController],
        exports: [limits_service_1.LimitsService],
    })
], LimitsModule);
//# sourceMappingURL=limits.module.js.map