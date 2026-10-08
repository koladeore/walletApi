"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var NotificationProcessor_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.NotificationProcessor = void 0;
const bullmq_1 = require("@nestjs/bullmq");
const common_1 = require("@nestjs/common");
let NotificationProcessor = NotificationProcessor_1 = class NotificationProcessor extends bullmq_1.WorkerHost {
    logger = new common_1.Logger(NotificationProcessor_1.name);
    process(job) {
        this.logger.log(`Processing notification job: ${job.name} (ID: ${job.id})`);
        try {
            if (job.data.currency !== 'NGN')
                throw new Error('Legacy notification requires currency review before replay');
            switch (job.name) {
                case 'transfer-received':
                    this.logger.log(`[SIMULATED PUSH] User ${job.data.userId} received NGN ${job.data.amount} from ${job.data.senderEmail}`);
                    break;
                default:
                    this.logger.warn(`Unknown job name: ${job.name}`);
            }
        }
        catch (error) {
            this.logger.error(`Failed to process job ${job.id}`, error);
            throw error;
        }
        return Promise.resolve();
    }
};
exports.NotificationProcessor = NotificationProcessor;
exports.NotificationProcessor = NotificationProcessor = NotificationProcessor_1 = __decorate([
    (0, bullmq_1.Processor)('notification')
], NotificationProcessor);
//# sourceMappingURL=notification.processor.js.map