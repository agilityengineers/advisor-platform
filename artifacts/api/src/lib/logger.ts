import pino from "pino";
import { env } from "../env";

export const logger = pino({
  level: env.logLevel,
  redact: ["req.headers.authorization", "req.headers.cookie", "res.headers['set-cookie']"],
  ...(env.isDevelopment ? { transport: { target: "pino-pretty", options: { colorize: true, translateTime: "HH:MM:ss" } } } : {}),
});
