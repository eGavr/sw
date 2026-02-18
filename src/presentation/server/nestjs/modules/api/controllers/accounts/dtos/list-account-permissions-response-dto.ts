import { PermissionList } from "../../../../../../../../domain/entities/permission/permission-list";
import { ResponseDto } from "../../../../../dtos/response-dto";

export class ListAccountPermissionsResponseDto implements ResponseDto {
    constructor(private readonly permissions: PermissionList) {}

    toObject(): object {
        return {
            permissions: this.permissions.toArray(),
        }
    }
}
