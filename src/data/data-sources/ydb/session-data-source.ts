import { Injectable } from "@nestjs/common";

@Injectable()
export class SessionDataSource {
    async create(): Promise<{ id: string }> {
        return { id: "some-session-id-created" };
    }
}
