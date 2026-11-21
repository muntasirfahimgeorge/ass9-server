
import {
  createRemoteJWKSet,
  jwtVerify,
} from "jose";

import { ApiError } from "../utils/ApiError.js";
import { env } from "../config/env.js";

// BetterAuth public key endpoint.
// jose automatically caches the remote JWKS.
const JWKS = createRemoteJWKSet(
  new URL("/api/auth/jwks", env.BETTER_AUTH_URL)
);

// Verify the JWT signature, issuer, audience and expiration.
export const verifyToken = async (req, res, next) => {
  const authorization = req.headers.authorization;

  if (!authorization) {
    return next(
      new ApiError(401, "Unauthorized: No token provided")
    );
  }

  const match = authorization.match(/^Bearer\s+([^\s]+)$/i);

  if (!match) {
    return next(
      new ApiError(401, "Unauthorized: Invalid authorization format")
    );
  }

  const token = match[1];

  try {
    const { payload } = await jwtVerify(token, JWKS, {
      issuer: env.BETTER_AUTH_URL,
      audience: env.BETTER_AUTH_URL,
    });

    const id =
      typeof payload.id === "string"
        ? payload.id
        : payload.sub;

    if (
      typeof id !== "string" ||
      typeof payload.email !== "string"
    ) {
      throw new Error("Required JWT claims are missing");
    }

    req.user = {
      id,
      name:
        typeof payload.name === "string"
          ? payload.name
          : "",
      email: payload.email,
      role:
        typeof payload.role === "string"
          ? payload.role
          : "",
    };

    next();
  } catch {
    next(
      new ApiError(401, "Unauthorized: Invalid or expired token")
    );
  }
};

// Common role authorization function.
const verifyRole = (requiredRole) => {
  return (req, res, next) => {
    if (!req.user) {
      return next(
        new ApiError(401, "Unauthorized: Authentication required")
      );
    }

    if (req.user.role !== requiredRole) {
      return next(
        new ApiError(403, "Forbidden: Insufficient permissions")
      );
    }

    next();
  };
};

// Customer-only access.
export const verifyCustomer = verifyRole("customer");

// Technician-only access.
export const verifyTechnician = verifyRole("technician");

// Admin-only access.
export const verifyAdmin = verifyRole("admin");
