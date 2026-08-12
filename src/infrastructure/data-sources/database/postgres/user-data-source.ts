import { Injectable } from "@nestjs/common";
import { DataSource } from "typeorm";

import { UserData } from "../../../../domain/entities/user/user";

import { User } from "./typeorm/entities/user/user";

@Injectable()
export class UserDataSource {
    constructor(private readonly dataSource: DataSource) {}

    async findOne(params: { externalId: string, providerType: string }): Promise<UserData | null> {
        const user = await this.dataSource.getRepository(User).findOne({ where: params });

        return user?.toObject() ?? null;
    }
}
