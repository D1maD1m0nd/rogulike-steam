import { Global, Injectable, Module, type OnApplicationShutdown, type OnModuleInit } from '@nestjs/common';
import { PrismaLibSql } from '@prisma/adapter-libsql';
import { PrismaClient, type Prisma } from '../../generated/prisma/client';
import { databaseUrl } from '../config';

export function createPrismaClient() {
  return new PrismaClient({ adapter: new PrismaLibSql({ url: databaseUrl(), timeout: 5000 }) });
}

export function writeTransaction<T>(client: PrismaClient, operation: (tx: Prisma.TransactionClient) => Promise<T>) {
  return client.$transaction(async tx => {
    // Take SQLite's write lock before reading mutable state in this deferred transaction.
    await tx.$executeRaw`UPDATE players SET day = day WHERE 0`;
    return operation(tx);
  }, { maxWait: 5000 });
}

@Injectable()
export class DatabaseService implements OnModuleInit, OnApplicationShutdown {
  readonly client = createPrismaClient();

  async onModuleInit() {
    await this.client.$connect();
    await this.client.$queryRaw`PRAGMA journal_mode = WAL`;
  }

  onApplicationShutdown() {
    return this.client.$disconnect();
  }
}

@Global()
@Module({ providers: [DatabaseService], exports: [DatabaseService] })
export class DatabaseModule {}
