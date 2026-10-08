"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppModule = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const environment_1 = require("./config/environment");
const nestjs_pino_1 = require("nestjs-pino");
const throttler_1 = require("@nestjs/throttler");
const core_1 = require("@nestjs/core");
const app_controller_1 = require("./app.controller");
const app_service_1 = require("./app.service");
const prisma_module_1 = require("./prisma/prisma.module");
const auth_module_1 = require("./auth/auth.module");
const users_module_1 = require("./users/users.module");
const wallet_module_1 = require("./wallet/wallet.module");
const bullmq_1 = require("@nestjs/bullmq");
const email_module_1 = require("./email/email.module");
const notification_module_1 = require("./notification/notification.module");
const paystack_module_1 = require("./paystack/paystack.module");
function prettyLogTarget() {
    if (process.env.NODE_ENV === 'production')
        return undefined;
    try {
        return require.resolve('pino-pretty');
    }
    catch {
        return undefined;
    }
}
const prettyTarget = prettyLogTarget();
let AppModule = class AppModule {
};
exports.AppModule = AppModule;
exports.AppModule = AppModule = __decorate([
    (0, common_1.Module)({
        imports: [
            config_1.ConfigModule.forRoot({
                isGlobal: true,
                validate: environment_1.validateEnvironment,
            }),
            nestjs_pino_1.LoggerModule.forRoot({
                pinoHttp: {
                    customProps: () => ({
                        context: 'HTTP',
                    }),
                    transport: prettyTarget
                        ? {
                            target: prettyTarget,
                            options: {
                                singleLine: true,
                            },
                        }
                        : undefined,
                },
            }),
            prisma_module_1.PrismaModule,
            auth_module_1.AuthModule,
            users_module_1.UsersModule,
            wallet_module_1.WalletModule,
            paystack_module_1.PaystackModule,
            email_module_1.EmailModule,
            notification_module_1.NotificationModule,
            bullmq_1.BullModule.forRootAsync({
                inject: [config_1.ConfigService],
                useFactory: (config) => ({
                    connection: {
                        host: config.getOrThrow('REDIS_HOST'),
                        port: config.getOrThrow('REDIS_PORT'),
                    },
                }),
            }),
            throttler_1.ThrottlerModule.forRoot([
                {
                    ttl: 60000,
                    limit: 10,
                },
            ]),
        ],
        controllers: [app_controller_1.AppController],
        providers: [
            app_service_1.AppService,
            {
                provide: core_1.APP_GUARD,
                useClass: throttler_1.ThrottlerGuard,
            },
        ],
    })
], AppModule);
//# sourceMappingURL=app.module.js.map