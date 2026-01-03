import pino from "pino";
const isProd = process.env.NODE_ENV === "production";
const pretty = process.env.LOG_PRETTY === "true" || (!isProd && process.env.LOG_PRETTY !== "false");
export const logger = pino({
    ...(pretty
        ? { transport: { target: "pino-pretty", options: { colorize: true } } }
        : {}),
    level: process.env.LOG_LEVEL || (isProd ? "warn" : "info"),
});
