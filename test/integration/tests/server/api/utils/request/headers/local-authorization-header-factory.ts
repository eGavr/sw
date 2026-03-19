import { LocalUser } from "../../../../../../../../src/data/data-sources/resource-provider/local/enties/local-user";

type AuthorizationHeader = { authorization: string };

export class LocalAuthorizationHeaderFactory {
    static createForUser(user: LocalUser): AuthorizationHeader {
        return LocalAuthorizationHeaderFactory.formatValid(user.externalId);
    }

    private static formatValid(value: string): AuthorizationHeader {
        return LocalAuthorizationHeaderFactory.format(`<${value}>`)
    }

    static createInvalidToken(): AuthorizationHeader {
        return LocalAuthorizationHeaderFactory.formatInvalid();
    }

    private static formatInvalid(): AuthorizationHeader {
        return LocalAuthorizationHeaderFactory.format("invalid-token");
    }

    private static format(srt: string): AuthorizationHeader {
        return { authorization: `Bearer ${srt}` };
    }
}
