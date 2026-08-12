import { Column } from "typeorm";

export const DateColumn = (): PropertyDecorator => Column({ type: "timestamptz" });
