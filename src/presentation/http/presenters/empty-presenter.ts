import { Presenter } from "./presenter";

export class EmptyPresenter implements Presenter {
    present(): object {
        return {};
    }
}
