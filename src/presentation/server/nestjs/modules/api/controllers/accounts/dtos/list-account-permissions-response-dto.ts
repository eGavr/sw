import { UserPermissionList } from "../../../../../../../../domain/entities/user/user-permission-list";
import { ResponseDto } from "../../../../../dtos/response-dto";

export class ListAccountPermissionsResponseDto implements ResponseDto {
    constructor(private readonly permissions: UserPermissionList) {}

    toObject(): object {
        return {
            permissions: this.permissions.toArray(),
        }
    }
}
