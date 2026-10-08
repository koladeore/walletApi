import { ConfigService } from '@nestjs/config';
export declare class PaystackService {
    private readonly config;
    constructor(config: ConfigService);
    checkConnection(): Promise<void>;
}
