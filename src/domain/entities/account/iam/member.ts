import { InvalidArgumentError } from "../../error/invalid-argument-error";

// A principal in an IAM binding, as a typed external identity (Google IAM style `user:<external-id>`).
// Members are stored as strings, not user foreign keys, so a principal need not exist yet to be
// granted a role — the user row is created lazily on first login.
export class Member {
    private static readonly userPrefix = "user:";

    static user(externalId: string): Member {
        return new Member(Member.userPrefix + externalId);
    }

    static fromString(value: string): Member {
        if (!value.startsWith(Member.userPrefix) || value.length <= Member.userPrefix.length) {
            throw new InvalidArgumentError(`invalid member: ${value}`);
        }

        return new Member(value);
    }

    private constructor(private readonly value: string) {}

    getValue(): string {
        return this.value;
    }

    equals(other: Member): boolean {
        return this.value === other.value;
    }
}
