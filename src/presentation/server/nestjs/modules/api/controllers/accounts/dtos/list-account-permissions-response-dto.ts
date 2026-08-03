import { AccountUserPermissionList } from "../../../../../../../../domain/entities/account/account-user-permission-list";
import { ResponseDto } from "../../../../../dtos/response-dto";

export class ListAccountPermissionsResponseDto implements ResponseDto {
    constructor(private readonly permissions: AccountUserPermissionList) {}

    toObject(): object {
        return {
            permissions: this.permissions.toArray(),
        };
    }
}
