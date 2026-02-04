export class Response {
    constructor(protected readonly result: object) {}

    toObject(): object {
        return this.result;
    }
}
