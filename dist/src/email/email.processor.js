"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var EmailProcessor_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.EmailProcessor = void 0;
const bullmq_1 = require("@nestjs/bullmq");
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const resend_1 = require("resend");
let EmailProcessor = EmailProcessor_1 = class EmailProcessor extends bullmq_1.WorkerHost {
    configService;
    logger = new common_1.Logger(EmailProcessor_1.name);
    resend;
    constructor(configService) {
        super();
        this.configService = configService;
        const resendApiKey = this.configService.get('RESEND_API_KEY');
        this.resend = new resend_1.Resend(resendApiKey || 're_mock_key1234');
    }
    async process(job) {
        this.logger.log(`Processing email job: ${job.name} (ID: ${job.id})`);
        try {
            switch (job.name) {
                case 'welcome-email':
                    await this.handleWelcomeEmail(job.data);
                    break;
                case 'transfer-receipt':
                    await this.handleTransferReceipt(job.data);
                    break;
                case 'transfer-incoming':
                    await this.handleTransferIncoming(job.data);
                    break;
                default:
                    this.logger.warn(`Unknown job name: ${job.name}`);
            }
        }
        catch (error) {
            this.logger.error(`Failed to process job ${job.id}`, error);
            throw error;
        }
    }
    getEmailTemplate(content) {
        return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
            background-color: #f4f5f7;
            margin: 0;
            padding: 40px 20px;
          }
          .container {
            max-width: 600px;
            margin: 0 auto;
            background-color: #ffffff;
            border-radius: 8px;
            overflow: hidden;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);
          }
          .header {
            background-color: #1a1b2e;
            padding: 30px 20px;
            text-align: center;
          }
          .header h1 {
            color: #ffffff;
            margin: 0;
            font-size: 24px;
            font-weight: 600;
          }
          .content {
            padding: 40px 30px;
            color: #333333;
            line-height: 1.6;
          }
          .content h2 {
            margin-top: 0;
            font-size: 18px;
            font-weight: 600;
            color: #111111;
            margin-bottom: 20px;
          }
          .details-box {
            background-color: #f8f9fa;
            border-radius: 6px;
            padding: 24px;
            margin: 30px 0;
          }
          .detail-row {
            margin-bottom: 16px;
          }
          .detail-row:last-child {
            margin-bottom: 0;
          }
          .detail-label {
            display: inline-block;
            width: 140px;
            color: #888888;
            font-weight: 500;
            font-size: 14px;
          }
          .detail-value {
            display: inline-block;
            color: #111111;
            font-weight: 700;
            font-size: 14px;
          }
          .footer {
            margin-top: 40px;
            font-size: 14px;
            color: #555555;
            line-height: 1.6;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Wallet</h1>
          </div>
          <div class="content">
            ${content}
          </div>
        </div>
      </body>
      </html>
    `;
    }
    async handleWelcomeEmail(data) {
        if (!this.configService.get('RESEND_API_KEY')) {
            this.logger.log(`[SIMULATED] Sending welcome email to ${data.email}`);
            return;
        }
        const htmlContent = `
      <h2>Hi ${data.name},</h2>
      <p>Welcome to Wallet! Your wallet account has been successfully created. Here are the details:</p>
      
      <div class="details-box">
        <div class="detail-row">
          <span class="detail-label">Status</span>
          <span class="detail-value">ACTIVE</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Time</span>
          <span class="detail-value">${new Date().toUTCString()}</span>
        </div>
      </div>
      
      <div class="footer">
        If this was you, no action is needed. If you did not register, please contact your administrator immediately.
      </div>
    `;
        await this.resend.emails.send({
            from: 'Wallet <onboarding@resend.dev>',
            to: data.email,
            subject: 'Welcome to Wallet',
            html: this.getEmailTemplate(htmlContent),
        });
    }
    async handleTransferReceipt(data) {
        if (!this.configService.get('RESEND_API_KEY')) {
            this.logger.log(`[SIMULATED] Sending transfer receipt to ${data.email}`);
            return;
        }
        const htmlContent = `
      <h2>Hi there,</h2>
      <p>A successful transfer was recorded from your Wallet account. Here are the details:</p>
      
      <div class="details-box">
        <div class="detail-row">
          <span class="detail-label">Sent To</span>
          <span class="detail-value">${data.receiverEmail}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Amount</span>
          <span class="detail-value">$${data.amount.toFixed(2)}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Time</span>
          <span class="detail-value">${new Date().toUTCString()}</span>
        </div>
      </div>
      
      <div class="footer">
        If this was you, no action is needed. If you did not authorize this transfer, please contact your administrator immediately.
      </div>
    `;
        await this.resend.emails.send({
            from: 'Wallet <onboarding@resend.dev>',
            to: data.email,
            subject: 'Wallet Transfer Receipt',
            html: this.getEmailTemplate(htmlContent),
        });
    }
    async handleTransferIncoming(data) {
        if (!this.configService.get('RESEND_API_KEY')) {
            this.logger.log(`[SIMULATED] Sending incoming funds email to ${data.email}`);
            return;
        }
        const htmlContent = `
      <h2>Hi there,</h2>
      <p>Great news! You have just received funds in your Wallet account. Here are the details:</p>
      
      <div class="details-box">
        <div class="detail-row">
          <span class="detail-label">Received From</span>
          <span class="detail-value">${data.senderEmail}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Amount</span>
          <span class="detail-value">$${data.amount.toFixed(2)}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Time</span>
          <span class="detail-value">${new Date().toUTCString()}</span>
        </div>
      </div>
      
      <div class="footer">
        If this was you, no action is needed. If you do not recognize this transaction, please contact your administrator immediately.
      </div>
    `;
        await this.resend.emails.send({
            from: 'Wallet <onboarding@resend.dev>',
            to: data.email,
            subject: 'Funds Received on Wallet!',
            html: this.getEmailTemplate(htmlContent),
        });
    }
};
exports.EmailProcessor = EmailProcessor;
exports.EmailProcessor = EmailProcessor = EmailProcessor_1 = __decorate([
    (0, bullmq_1.Processor)('email'),
    __metadata("design:paramtypes", [config_1.ConfigService])
], EmailProcessor);
//# sourceMappingURL=email.processor.js.map