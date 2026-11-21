
import { Router } from "express";

import { usersCollection } from "../../config/db.js";
import { verifyToken } from "../../middleware/auth.js";
import { sendSuccess } from "../../utils/apiResponse.js";
import { ApiError } from "../../utils/ApiError.js";

const router = Router();

const PROFILE_FIELDS = [
  "name",
  "phone",
  "area",
  "bio",
  "image",
];

function validateProfileData(data) {
  if (
    !data ||
    typeof data !== "object" ||
    Array.isArray(data)
  ) {
    throw new ApiError(400, "Invalid profile data");
  }

  const allowedFields = new Set(PROFILE_FIELDS);

  for (const field of Object.keys(data)) {
    if (!allowedFields.has(field)) {
      throw new ApiError(
        400,
        `You cannot update the field: ${field}`
      );
    }
  }

  const updates = {};

  for (const field of PROFILE_FIELDS) {
    if (!Object.hasOwn(data, field)) {
      continue;
    }

    const value = data[field];

    if (field === "image") {
      if (value === null || value === "") {
        updates.image = null;
        continue;
      }

      if (typeof value !== "string") {
        throw new ApiError(400, "Invalid profile image");
      }

      let imageUrl;

      try {
        imageUrl = new URL(value);
      } catch {
        throw new ApiError(400, "Invalid profile image URL");
      }

      if (
        !["http:", "https:"].includes(imageUrl.protocol)
      ) {
        throw new ApiError(400, "Invalid profile image URL");
      }

      updates.image = imageUrl.toString();
      continue;
    }

    if (typeof value !== "string") {
      throw new ApiError(
        400,
        `${field} must be a string`
      );
    }

    const cleanValue = value.trim();

    if (field === "name") {
      if (cleanValue.length < 2 || cleanValue.length > 80) {
        throw new ApiError(
          400,
          "Name must contain between 2 and 80 characters"
        );
      }
    }

    if (field === "phone") {
      if (
        cleanValue &&
        (
          cleanValue.length < 7 ||
          cleanValue.length > 20 ||
          !/^[+\d()\-\s]+$/.test(cleanValue)
        )
      ) {
        throw new ApiError(400, "Invalid phone number");
      }
    }

    if (field === "area" && cleanValue.length > 100) {
      throw new ApiError(
        400,
        "Area cannot exceed 100 characters"
      );
    }

    if (field === "bio" && cleanValue.length > 500) {
      throw new ApiError(
        400,
        "Bio cannot exceed 500 characters"
      );
    }

    updates[field] = cleanValue;
  }

  if (Object.keys(updates).length === 0) {
    throw new ApiError(
      400,
      "Provide at least one profile field to update"
    );
  }

  return updates;
}

// GET /api/users/me
// Fetch the currently authenticated user's profile.

router.get(
  "/me",
  verifyToken,
  async (req, res) => {
    const user = await usersCollection.findOne(
      {
        email: req.user.email,
      },
      {
        projection: {
          password: 0,
          passwordHash: 0,
        },
      }
    );

    if (!user) {
      throw new ApiError(404, "User profile not found");
    }

    sendSuccess(
      res,
      user,
      "Profile fetched successfully"
    );
  }
);

// PATCH /api/users/profile
// Update only the authenticated user's profile.
// Email and role cannot be changed through this endpoint.

router.patch(
  "/profile",
  verifyToken,
  async (req, res) => {
    const updates = validateProfileData(req.body);

    const result = await usersCollection.updateOne(
      {
        email: req.user.email,
      },
      {
        $set: {
          ...updates,
          updatedAt: new Date(),
        },
      }
    );

    if (result.matchedCount === 0) {
      throw new ApiError(404, "User profile not found");
    }

    const updatedUser = await usersCollection.findOne(
      {
        email: req.user.email,
      },
      {
        projection: {
          password: 0,
          passwordHash: 0,
        },
      }
    );

    sendSuccess(
      res,
      updatedUser,
      "Profile updated successfully"
    );
  }
);

export default router;
