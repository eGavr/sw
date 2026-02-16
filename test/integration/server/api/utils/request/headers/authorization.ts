import { SuperUser } from "../../../../../../../src/data/data-sources/acl/local/entities/super-user";

type AuthorizationHeader = { authorization: string };

export class Authorization {
    static get SuperUser(): AuthorizationHeader {
        return Authorization.format(`<${SuperUser.id}>`);
    }

    static get UserWithoutPermissions(): AuthorizationHeader {
        return Authorization.format("<user-without-permissions>");
    }

    static get InvalidToken(): AuthorizationHeader {
        return Authorization.format("invalid-token");
    }

    private static format(str: string): AuthorizationHeader {
        return { authorization: `Bearer ${str}` };
    }
}
