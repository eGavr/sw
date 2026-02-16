export class SuperUser {
    static readonly id = "1234567890";

    static isSuperUser(id: string): boolean {
        return SuperUser.id === id;
    }
}
