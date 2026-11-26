import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { setTimeout } from 'node:timers/promises';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
  });

  afterEach(async () => {
    await app?.close();
  });

  it('GET /api/v1', async () => {
    // The rate limiter opens its Redis connection asynchronously during startup.
    const server = app.getHttpServer();
    let response = await request(server).get('/api/v1');
    for (let attempt = 0; attempt < 10 && response.status === 503; attempt++) {
      await setTimeout(100);
      response = await request(server).get('/api/v1');
    }
    expect(response.status).toBe(200);
    expect(response.text).toBe('Hello World!');
  });
});
