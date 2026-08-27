import { Presenter } from "../../../../presenters/presenter";

// Least-information response: the environment uid and whether the video was stored. Never echoes the
// bucket, object key, or the video bytes.
export class UploadSessionVideoPresenter implements Presenter {
    constructor(private readonly environmentId: string, private readonly stored: boolean) {}

    present(): object {
        return {
            uid: this.environmentId,
            stored: this.stored,
        };
    }
}
