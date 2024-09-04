import "reflect-metadata";
import { DataSource } from "typeorm";

const ENTITY_PATH = __dirname + "/entity/*";
const MIGRATION_PATH = __dirname + "/migrations/*";

export const AppDataSource = new DataSource({
  type: "postgres",
  url: process.env["POSTGRES_URL"] ?? "postgres://localhost",
  logging: false,
  entities: [ENTITY_PATH],
  migrations: [MIGRATION_PATH],
  subscribers: [],
});
