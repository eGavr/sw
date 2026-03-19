import { Column, Entity, PrimaryGeneratedColumn } from "typeorm";

@Entity()
export class AccountResourceProvider {
    @PrimaryGeneratedColumn("uuid")
    id: string;

    @Column()
    providerId: string;

    @Column()
    providerType: string;
}
