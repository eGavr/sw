import { Headroom } from "./headroom";

describe("Headroom", () => {
    test("an unbounded cloud leaves the pool's own cap and estimate in force", () => {
        expect(Headroom.unbounded().capAt(7)).toBe(7);
        expect(Headroom.unbounded().limitsFor(7)).toEqual({ maxLeases: 7, maxAwaitingMachine: null });
        expect(Headroom.unbounded().slotCapacityOr(12)).toBe(12);
    });

    test("a finite inventory caps the pool at its free machines and sizes the lease by the next one", () => {
        expect(Headroom.of(2, 4).capAt(7)).toBe(2);
        expect(Headroom.of(9, 4).capAt(7)).toBe(7);
        expect(Headroom.of(-1, null).capAt(7)).toBe(0);
        expect(Headroom.of(2, 4).limitsFor(7)).toEqual({ maxLeases: 7, maxAwaitingMachine: 2 });
        expect(Headroom.of(2, 4).slotCapacityOr(12)).toBe(4);
    });
});
