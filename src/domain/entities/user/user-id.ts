import { Uuid } from "../../types/uuid/uuid";

export class UserId extends Uuid {}

export type UserIdValue = ReturnType<UserId["getValue"]>;
