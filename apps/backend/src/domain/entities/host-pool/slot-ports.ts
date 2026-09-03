import { InvalidArgumentError } from "../error/invalid-argument-error";

const wdBase = 4600;
const appiumBase = 4700;
const consoleBase = 5554;

// The port layout of one slot — a pure function of the slot index and a CONTRACT with the host
// image's slot launcher: both sides derive the same numbers, nothing is negotiated at runtime.
//   wd       4600+i   the slot's WebDriver door (status shim), what the environment advertises
//   appium   4700+i   the Appium server behind it
//   console  5554+2i  the emulator console; adb discovers only even ports in 5554..5584, which caps
//                     a host at 16 slots regardless of cores (adb = console+1, derived on the host)
export class SlotPorts {
    static readonly maxSlots = 16;

    static forIndex(index: number): SlotPorts {
        if (!Number.isInteger(index) || index < 0 || index >= SlotPorts.maxSlots) {
            throw new InvalidArgumentError(`slot index out of range: ${index}`);
        }

        return new SlotPorts(wdBase + index, appiumBase + index, consoleBase + 2 * index);
    }

    private constructor(
        readonly wd: number,
        readonly appium: number,
        readonly console: number,
    ) {}
}
