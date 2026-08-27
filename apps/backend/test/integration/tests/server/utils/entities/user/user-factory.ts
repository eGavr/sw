import { v4 as uuidv4 } from "uuid";

// A "user" under local auth is just an external id; make unique ones so cases don't collide.
export class UserFactory {
    static createId(prefix = "user"): string {
        return `${prefix}-${uuidv4().substring(0, 8)}`;
    }
}
