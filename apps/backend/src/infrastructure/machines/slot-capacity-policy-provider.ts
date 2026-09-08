import { ConfigService } from "@nestjs/config";

import { SlotCapacityPolicy } from "../../domain/entities/machine/slot-capacity-policy";
import { SlotPorts } from "../../domain/entities/machine-pool/slot-ports";

// An android emulator is worth about four cores; the port contract caps a machine at 16 slots.
const defaultSlotCores = 4;

// MACHINE_SLOT_CORES: how many cores one slot costs on a machine — the install's slicing policy.
export const SlotCapacityPolicyProvider = {
    provide: SlotCapacityPolicy,
    useFactory: (configService: ConfigService): SlotCapacityPolicy => new SlotCapacityPolicy(
        Number(configService.get<string>("MACHINE_SLOT_CORES") ?? String(defaultSlotCores)),
        SlotPorts.maxSlots,
    ),
    inject: [ConfigService],
};
