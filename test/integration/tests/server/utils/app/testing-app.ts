import { INestApplication as NestApplication, NestModule } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { App } from "supertest/types";

export class TestingApp {
    static async create(module: new () => NestModule): Promise<TestingApp> {
        const moduleFixture: TestingModule = await Test.createTestingModule({
            imports: [module],
        }).compile();

        const app = moduleFixture.createNestApplication();

        app.enableShutdownHooks();

        await app.init();

        return new this(app);
    }

    constructor(public app: NestApplication<App>) {}

    getHttpServer(): App {
        return this.app.getHttpServer();
    }

    async close(): Promise<void> {
        await this.app.close();
    }
}
