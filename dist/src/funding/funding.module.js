"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.FundingModule = void 0;
const common_1 = require("@nestjs/common");
const paystack_module_1 = require("../paystack/paystack.module");
const funding_service_1 = require("./funding.service");
const funding_controller_1 = require("./funding.controller");
const confirmation_service_1 = require("./confirmation.service");
const webhook_service_1 = require("./webhook.service");
const paystack_controller_1 = require("./paystack.controller");
const funding_worker_1 = require("./funding.worker");
let FundingModule = class FundingModule {
};
exports.FundingModule = FundingModule;
exports.FundingModule = FundingModule = __decorate([
    (0, common_1.Module)({
        imports: [paystack_module_1.PaystackModule],
        providers: [funding_service_1.FundingService, confirmation_service_1.ConfirmationService, webhook_service_1.WebhookService, funding_worker_1.FundingWorker],
        controllers: [funding_controller_1.FundingController, paystack_controller_1.PaystackController],
    })
], FundingModule);
//# sourceMappingURL=funding.module.js.map