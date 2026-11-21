
import "dotenv/config";

const DB_URI = process.env.DB_URI;

if (!DB_URI) {
  throw new Error(
    "Missing required environment variable: DB_URI"
  );
}

const CLIENT_URL =
  process.env.CLIENT_URL || "http://localhost:3000";

const BETTER_AUTH_URL =
  process.env.BETTER_AUTH_URL || CLIENT_URL;

export const env = {
  PORT: Number(process.env.PORT) || 5000,
  DB_URI,
  CLIENT_URL,
  BETTER_AUTH_URL,
  STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
  STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
};
