import { UserPermissionName } from "../../../../../../../../domain/entities/user/user-permission-name";
import { ResponseDto } from "../../../../../dtos/response-dto";

export class TestIamPermissionsResponseDto implements ResponseDto {
    constructor(private readonly permissions: ReadonlyArray<UserPermissionName>) {}

    toObject(): object {
        return {
            permissions: [...this.permissions],
        };
    }
}
