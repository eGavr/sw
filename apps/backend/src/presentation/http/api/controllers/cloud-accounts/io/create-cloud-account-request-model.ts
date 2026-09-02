import { IsString } from "class-validator";

// Connect a cloud to the project. `type` is validated against the cloud catalogue in the use case.
// Nothing else: everything the user must name or grant (folder, cluster) belongs to a compute binding,
// and credentials never travel here.
export class CreateCloudAccountRequestModel {
    @IsString()
    type: string;
}
