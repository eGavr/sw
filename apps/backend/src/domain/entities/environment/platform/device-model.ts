import { Matches, MaxLength } from "class-validator";

import { Value } from "../../../types/value/value";

// The KIND of device an environment is — `pixel-7`, `iphone-15`, `desktop` — never an instance (an
// instance is the environment itself). Canonical ids are lower-case hyphenated words; humans type the
// model any way they like (`Pixel 7`, `pixel_7`) and `fromWord` folds it to the id. What the id stands
// for depends on how the environment is executed: a virtual one wears the model's hardware profile,
// a physical one IS the model.
export class DeviceModel extends Value<string> {
    @MaxLength(64)
    @Matches(/^[a-z0-9]+(-[a-z0-9]+)*$/)
    declare protected value: string;

    static fromWord(word: string): DeviceModel {
        return new DeviceModel(word.trim().toLowerCase().replace(/[\s_]+/g, "-"));
    }

    equals(other: DeviceModel): boolean {
        return this.value === other.value;
    }
}
