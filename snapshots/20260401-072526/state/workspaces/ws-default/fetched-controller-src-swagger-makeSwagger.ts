import fs from "fs";
import bundledSwaggerDoc from "./swagger.json";

type SwaggerDoc = Record<string, unknown>;

function safeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function readSwaggerFile(filePath: string): SwaggerDoc | null {
  try {
    const fileContent = fs.readFileSync(filePath, "utf8");
    return JSON.parse(fileContent) as SwaggerDoc;
  } catch {
    return null;
  }
}

export function makeSwaggerDoc(): SwaggerDoc {
  const overridePath = safeString(process.env.SWAGGER_FILE_PATH);
  if (overridePath) {
    const overrideDoc = readSwaggerFile(overridePath);
    if (overrideDoc) {
      console.info("[swagger] loaded spec from %s", overridePath);
      return overrideDoc;
    }

    console.warn(
      "[swagger] unable to load SWAGGER_FILE_PATH=%s; falling back to bundled spec",
      overridePath,
    );
  }

  console.info("[swagger] loaded bundled spec from src/swagger/swagger.json");
  return bundledSwaggerDoc as SwaggerDoc;
}
