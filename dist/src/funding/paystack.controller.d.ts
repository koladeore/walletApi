import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { WebhookService } from './webhook.service';
export declare class PaystackController {
    private readonly webhook;
    constructor(webhook: WebhookService);
    receive(req: RawBodyRequest<Request>, signature: string): Promise<{
        received: boolean;
    }>;
    callback(): {
        message: string;
    };
}
