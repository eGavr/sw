import { ApplicationData } from "../../../domain/entities/environment/application/application";
import { EnvironmentData } from "../../../domain/entities/environment/environment";

export type CreateEnvironmentInput = {
    accountId: string;
    platform: { name: string; version: string; deviceModel?: string | null };
    applications: Array<ApplicationData>;
};

export abstract class EnvironmentDataSource {
    abstract create(input: CreateEnvironmentInput): Promise<EnvironmentData>;
    abstract get(id: string): Promise<EnvironmentData | null>;
    abstract listByAccount(accountId: string): Promise<Array<EnvironmentData>>;
    abstract delete(id: string): Promise<void>;
}
