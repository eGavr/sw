import { PrimaryColumn } from "typeorm";

export class AccountPermission {
    @PrimaryColumn("uuid")
    id: string;
}
