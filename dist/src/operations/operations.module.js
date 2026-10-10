"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.OperationsModule = void 0;
const runtime_mode_1 = require("../config/runtime-mode");
const common_1 = require("@nestjs/common");
const paystack_module_1 = require("../paystack/paystack.module");
const financial_service_1 = require("./financial.service");
const reconciliation_service_1 = require("./reconciliation.service");
const operations_controller_1 = require("./operations.controller");
const operations_worker_1 = require("./operations.worker");
const security_module_1 = require("../security/security.module");
let OperationsModule = class OperationsModule {
};
exports.OperationsModule = OperationsModule;
exports.OperationsModule = OperationsModule = __decorate([
    (0, common_1.Module)({
        imports: [paystack_module_1.PaystackModule, security_module_1.SecurityModule],
        providers: [
            financial_service_1.FinancialService,
            reconciliation_service_1.ReconciliationService,
            ...((0, runtime_mode_1.workersEnabled)() ? [operations_worker_1.OperationsWorker] : []),
        ],
        controllers: [operations_controller_1.OperationsController],
        exports: [financial_service_1.FinancialService],
    })
], OperationsModule);
//# sourceMappingURL=operations.module.js.map