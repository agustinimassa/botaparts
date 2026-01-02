import dotenv from "dotenv";
import fs from "fs";
import path from "path";

/**
 * Carga las variables de entorno desde .env y .env.local
 * .env.local sobrescribe las variables de .env si existen
 */
export const loadEnv = () => {
  // Cargar .env primero (valores por defecto)
  dotenv.config();

  // Cargar .env.local si existe (sobrescribe valores de .env)
  const envLocalPath = path.resolve(".env.local");
  if (fs.existsSync(envLocalPath)) {
    dotenv.config({ path: envLocalPath, override: true });
  }
};

