import { IsNotEmpty, IsString } from "class-validator";

export class HostHeartbeatRequestModel {
    // Where the machine is reachable; the agent knows its own address and always reports it (the
    // first check-in registers it, later ones keep it fresh across re-addressing).
    @IsString()
    @IsNotEmpty()
    hostIp: string;
}
