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
Object.defineProperty(exports, "__esModule", { value: true });
exports.PrismaService = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const adapter_pg_1 = require("@prisma/adapter-pg");
const config_1 = require("@nestjs/config");
const pg_1 = require("pg");
let PrismaService = class PrismaService extends client_1.PrismaClient {
    constructor(config) {
        const url = config.getOrThrow('DATABASE_URL');
        const pool = new pg_1.Pool({
            connectionString: url,
            max: config.get('DB_POOL_MAX') ?? 10,
            connectionTimeoutMillis: config.get('DB_CONNECTION_TIMEOUT_MS') ?? 5000,
            idleTimeoutMillis: config.get('DB_IDLE_TIMEOUT_MS') ?? 30000,
            statement_timeout: config.get('DB_STATEMENT_TIMEOUT_MS') ?? 15000,
            lock_timeout: config.get('DB_LOCK_TIMEOUT_MS') ?? 5000,
            application_name: 'wallet-api',
        });
        const adapter = new adapter_pg_1.PrismaPg(pool, {
            disposeExternalPool: true,
            onPoolError: () => common_1.Logger.error('Database pool connection error', 'PrismaService'),
        });
        super({ adapter });
    }
    async onModuleInit() {
        await this.$connect();
    }
    async onModuleDestroy() {
        await this.$disconnect();
    }
};
exports.PrismaService = PrismaService;
exports.PrismaService = PrismaService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], PrismaService);
//# sourceMappingURL=prisma.service.js.map