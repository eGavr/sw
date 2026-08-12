import { Member } from "./member";
import { RoleName } from "./role";

// One binding of an IAM policy: a role granted to a set of members (Google IAM shape `{role, members}`).
export class IamBinding {
    static create(role: RoleName, members: ReadonlyArray<Member>): IamBinding {
        return new IamBinding(role, [...members]);
    }

    private constructor(
        readonly role: RoleName,
        private readonly members: Array<Member>,
    ) {}

    hasMember(member: Member): boolean {
        return this.members.some((candidate) => candidate.equals(member));
    }

    memberValues(): Array<string> {
        return this.members.map((member) => member.getValue());
    }
}
