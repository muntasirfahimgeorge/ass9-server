
import "dotenv/config";

const DB_URI = process.env.DB_URI?.trim();

if (!DB_URI) {
  throw new Error(
    "Missing required environment variable: DB_URI"
  );
}

function validatePort(value) {
  if (value === undefined || value.trim() === "") {
    return 5000;
  }

  const port = Number(value);

  if (
    !Number.isInteger(port) ||
    port < 1 ||
    port > 65535
  ) {
    throw new Error(
      "PORT must be an integer between 1 and 65535"
    );
  }

  return port;
}

function validateHttpUrl(value, variableName) {
  try {
    const parsedUrl = new URL(value);

    if (
      !["http:", "https:"].includes(parsedUrl.protocol) ||
      !parsedUrl.hostname
    ) {
      throw new Error();
    }

    return value;
  } catch {
    throw new Error(
      `${variableName} must be a valid HTTP or HTTPS URL`
    );
  }
}

const PORT = validatePort(process.env.PORT);

const CLIENT_URL = validateHttpUrl(
  process.env.CLIENT_URL?.trim() || "http://localhost:3000",
  "CLIENT_URL"
);

const BETTER_AUTH_URL = validateHttpUrl(
  process.env.BETTER_AUTH_URL?.trim() || CLIENT_URL,
  "BETTER_AUTH_URL"
);

export const env = {
  PORT,
  DB_URI,
  CLIENT_URL,
  BETTER_AUTH_URL,
  STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
  STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
};
