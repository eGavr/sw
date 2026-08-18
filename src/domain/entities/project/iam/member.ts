import { InvalidArgumentError } from "../../error/invalid-argument-error";

// A principal in an IAM binding, as a typed external identity (Google IAM style `user:<external-id>` or
// `group:<group-id>`). Members are stored as strings, not foreign keys, so a principal need not exist yet
// to be granted a role. A group is referenced, never managed here: its membership comes from the identity
// provider (see access control), so a role granted to `group:<id>` reaches everyone the IdP puts in it.
export class Member {
    private static readonly userPrefix = "user:";
    private static readonly groupPrefix = "group:";

    static user(externalId: string): Member {
        return new Member(Member.userPrefix + externalId);
    }

    static group(groupId: string): Member {
        return new Member(Member.groupPrefix + groupId);
    }

    static fromString(value: string): Member {
        if (!Member.hasIdentity(value, Member.userPrefix) && !Member.hasIdentity(value, Member.groupPrefix)) {
            throw new InvalidArgumentError(`invalid member: ${value}`);
        }

        return new Member(value);
    }

    private static hasIdentity(value: string, prefix: string): boolean {
        return value.startsWith(prefix) && value.length > prefix.length;
    }

    private constructor(private readonly value: string) {}

    getValue(): string {
        return this.value;
    }

    equals(other: Member): boolean {
        return this.value === other.value;
    }
}
