import { convertNumber } from "../util/utils";

export interface IEnvironment {
  app: {
    name: string;
    nameUnderscore: string;
    version: string;
    description: string;
    host: string;
    port: number;
    env: string;
    logLevel: string;
  };
  db: {
    pwd: string;
    url: string;
    user: string;
  };
  isValid: () => boolean;
}

export const environment: IEnvironment = {
  app: {
    name: process.env.npm_package_name || "psc-sre-automacao-agent",
    nameUnderscore:
      (process.env.npm_package_name || "").split("-").join("_") ||
      "psc-sre-automacao-agent".split("-").join("_"),
    version: process.env.npm_package_version || "?.?.?",
    description:
      process.env.npm_package_description ||
      "psc-sre-automacao-agent in node with expressjs",
    env: process.env.NODE_ENV || "undefined",
    host: process.env.APP_HOST || "localhost",
    port: convertNumber(process.env.API_PORT, 8080),
    logLevel: process.env.LOG_LEVEL
      ? process.env.LOG_LEVEL.toLowerCase()
      : "info",
  },
  db: {
    pwd: "",
    url: "",
    user: "",
  },
  isValid() {
    return true;
  },
};
