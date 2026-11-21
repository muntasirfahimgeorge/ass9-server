
import express from "express";
import cors from "cors";

import { env } from "./config/env.js";
import routes from "./routes/index.js";

import {
  stripeWebhookHandler,
} from "./routes/payments/index.js";

import { notFound } from "./middleware/notFound.js";
import { errorHandler } from "./middleware/errorHandler.js";

const app = express();

// Stripe requires the original raw request body for
// webhook signature verification.
// This MUST be registered before express.json().

app.post(
  "/api/payments/webhook",
  express.raw({ type: "application/json" }),
  stripeWebhookHandler
);

// CORS configuration.
app.use(
  cors({
    origin: env.CLIENT_URL,
  })
);

// Parse ordinary JSON API requests.
app.use(express.json({ limit: "1mb" }));

// All normal API routes start with /api.
app.use("/api", routes);

// Not found and centralized error handling.
app.use(notFound);
app.use(errorHandler);

export default app;
