import { Stereotype } from "../cloud-account/stereotype";

export type FreeMachinePredicate = {
    readonly cloudAccountId: string;
    readonly stereotype: Stereotype;
    readonly ready: true;
    readonly unleased: true;
};

// Which machines of a cloud the pool may take for a stereotype right now: ready (online, open, no
// blocking condition — the aggregate keeps that word current) and holding no lease. The data source
// translates it into the claim query; the domain owns the meaning.
export class FreeMachineCriteria {
    static for(cloudAccountId: string, stereotype: Stereotype): FreeMachineCriteria {
        return new FreeMachineCriteria({ cloudAccountId, stereotype, ready: true, unleased: true });
    }

    private constructor(private readonly predicate: FreeMachinePredicate) {}

    toPredicate(): FreeMachinePredicate {
        return this.predicate;
    }
}
