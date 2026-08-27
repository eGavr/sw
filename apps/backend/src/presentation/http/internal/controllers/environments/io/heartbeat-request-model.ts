import { IsBoolean, IsNotEmpty, IsOptional, IsString } from "class-validator";

export class HeartbeatRequestModel {
    // Present on the first heartbeat (registration); omitted afterwards.
    @IsOptional()
    @IsString()
    @IsNotEmpty()
    endpoint?: string;

    @IsBoolean()
    busy: boolean;
}
