import { InvalidArgumentError } from "../error/invalid-argument-error";

import { EnvironmentQuota, EnvironmentQuotaPolicy } from "./environment-quota";
import { EnvironmentState } from "./environment-state";

const policy = new EnvironmentQuotaPolicy(5, 50);

describe("EnvironmentQuota", () => {
    test("a binding without its own limit gets the install default", () => {
        expect(EnvironmentQuota.fromBindingConfig({}, policy).limit).toBe(5);
        expect(EnvironmentQuota.fromBindingConfig({ maxEnvironments: "junk" }, policy).limit).toBe(5);
    });

    test("a binding may widen its own quota, clamped by the install max", () => {
        expect(EnvironmentQuota.fromBindingConfig({ maxEnvironments: 20 }, policy).limit).toBe(20);
        expect(EnvironmentQuota.fromBindingConfig({ maxEnvironments: 999 }, policy).limit).toBe(50);
    });

    test("counts everything alive or still holding resources — only failed rows are free", () => {
        const claim = EnvironmentQuota.fromBindingConfig({}, policy).toClaim("account", "android", "emulator");

        expect(claim.countedStates).toContain(EnvironmentState.Deleting);
        expect(claim.countedStates).not.toContain(EnvironmentState.Failed);
        expect(claim.limit).toBe(5);
    });

    test("refuses to write a malformed limit into the binding", () => {
        expect(() => EnvironmentQuota.validateConfigured(undefined, policy)).not.toThrow();
        expect(() => EnvironmentQuota.validateConfigured(10, policy)).not.toThrow();
        expect(() => EnvironmentQuota.validateConfigured(0, policy)).toThrow(InvalidArgumentError);
        expect(() => EnvironmentQuota.validateConfigured(51, policy)).toThrow(InvalidArgumentError);
        expect(() => EnvironmentQuota.validateConfigured("10", policy)).toThrow(InvalidArgumentError);
        expect(() => EnvironmentQuota.validateConfigured(2.5, policy)).toThrow(InvalidArgumentError);
    });

    test("the policy itself rejects nonsense bounds", () => {
        expect(() => new EnvironmentQuotaPolicy(0, 50)).toThrow(InvalidArgumentError);
        expect(() => new EnvironmentQuotaPolicy(5, 4)).toThrow(InvalidArgumentError);
    });
});
