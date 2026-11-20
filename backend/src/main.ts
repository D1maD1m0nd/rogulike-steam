import 'reflect-metadata';
import { Controller, Get, Module, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import express, { type NextFunction, type Request, type Response } from 'express';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { CatalogModule } from './catalog/catalog.module';
import { port, rootDir } from './config';
import { DatabaseModule } from './database/database.module';
import { PlayerModule } from './player/player.module';
import { RunModule } from './run/run.module';

@Controller('health')
class HealthController {
  @Get()
  health() { return { ok: true }; }
}

@Module({ imports: [DatabaseModule, CatalogModule, PlayerModule, RunModule], controllers: [HealthController] })
class AppModule {}

const app = await NestFactory.create(AppModule, { bodyParser: false });
app.setGlobalPrefix('api');
app.enableShutdownHooks();
app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }));
app.getHttpAdapter().getInstance().disable('x-powered-by');
app.use('/api', (_request: Request, response: Response, next: NextFunction) => {
  response.setHeader('X-Content-Type-Options', 'nosniff');
  next();
});
app.use('/api', express.json({ limit: '12kb' }));
const frontend = join(rootDir, 'frontend', 'dist');
if (existsSync(join(frontend, 'index.html'))) app.use(express.static(frontend));
await app.listen(port(), process.env.HOST || '127.0.0.1');
