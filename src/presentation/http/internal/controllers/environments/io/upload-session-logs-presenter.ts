import { Presenter } from "../../../../presenters/presenter";

// Least-information response: the environment uid and whether the logs were stored. Never echoes the
// bucket, object key, or the log bytes.
export class UploadSessionLogsPresenter implements Presenter {
    constructor(private readonly environmentId: string, private readonly stored: boolean) {}

    present(): object {
        return {
            uid: this.environmentId,
            stored: this.stored,
        };
    }
}
