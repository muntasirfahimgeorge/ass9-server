
import { Router } from "express";
import { ObjectId } from "mongodb";

import {
  servicesCollection,
} from "../../config/db.js";

import {
  verifyToken,
  verifyTechnician,
} from "../../middleware/auth.js";

import { sendSuccess } from "../../utils/apiResponse.js";
import { ApiError } from "../../utils/ApiError.js";

const serviceRouter = Router();

const CATEGORIES = [
  "Smartphone",
  "Laptop & PC",
  "AC",
  "Refrigerator",
  "TV",
  "Washing Machine",
  "Electrical",
];

const SERVICE_MODES = [
  "Home Visit",
  "Shop Drop-off",
];

const EDITABLE_FIELDS = [
  "title",
  "category",
  "description",
  "image",
  "basePrice",
  "estimatedDuration",
  "serviceMode",
  "serviceArea",
];

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function validateObjectId(id) {
  if (!ObjectId.isValid(id)) {
    throw new ApiError(404, "Service not found");
  }

  return new ObjectId(id);
}

function validateImageUrl(value) {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol);
  } catch {
    return false;
  }
}

function validateServiceData(data, partial = false) {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new ApiError(400, "Invalid service data");
  }

  const result = {};

  for (const field of EDITABLE_FIELDS) {
    if (!Object.hasOwn(data, field)) {
      continue;
    }

    const value = data[field];

    if (
      field === "basePrice"
    ) {
      const price = Number(value);

      if (!Number.isFinite(price) || price <= 0) {
        throw new ApiError(
          400,
          "Base price must be a positive number"
        );
      }

      result.basePrice = price;
      continue;
    }

    if (typeof value !== "string" || !value.trim()) {
      throw new ApiError(
        400,
        `${field} must be a non-empty string`
      );
    }

    const cleanValue = value.trim();

    if (
      field === "category" &&
      !CATEGORIES.includes(cleanValue)
    ) {
      throw new ApiError(400, "Invalid service category");
    }

    if (
      field === "serviceMode" &&
      !SERVICE_MODES.includes(cleanValue)
    ) {
      throw new ApiError(400, "Invalid service mode");
    }

    if (
      field === "image" &&
      !validateImageUrl(cleanValue)
    ) {
      throw new ApiError(400, "Invalid service image URL");
    }

    result[field] = cleanValue;
  }

  if (!partial) {
    for (const field of EDITABLE_FIELDS) {
      if (!Object.hasOwn(result, field)) {
        throw new ApiError(
          400,
          `${field} is required`
        );
      }
    }
  }

  if (partial && Object.keys(result).length === 0) {
    throw new ApiError(
      400,
      "Provide at least one valid field to update"
    );
  }

  return result;
}

// GET /api/services
// Public: returns only approved and available services.
// Search, filtering and sorting happen in MongoDB.

serviceRouter.get("/", async (req, res) => {
  const {
    search,
    category,
    serviceMode,
    sort = "newest",
  } = req.query;

  const filter = {
    approvalStatus: "approved",
    isAvailable: true,
  };

  if (search !== undefined) {
    if (typeof search !== "string" || search.length > 100) {
      throw new ApiError(400, "Invalid search value");
    }

    const searchRegex = new RegExp(
      escapeRegex(search.trim()),
      "i"
    );

    filter.$or = [
      { title: searchRegex },
      { category: searchRegex },
    ];
  }

  if (category !== undefined) {
    if (
      typeof category !== "string" ||
      !CATEGORIES.includes(category)
    ) {
      throw new ApiError(400, "Invalid category filter");
    }

    filter.category = category;
  }

  if (serviceMode !== undefined) {
    if (
      typeof serviceMode !== "string" ||
      !SERVICE_MODES.includes(serviceMode)
    ) {
      throw new ApiError(400, "Invalid service mode filter");
    }

    filter.serviceMode = serviceMode;
  }

  const sortOptions = {
    newest: { createdAt: -1 },
    "price-asc": { basePrice: 1 },
    "price-desc": { basePrice: -1 },
  };

  if (
    typeof sort !== "string" ||
    !Object.hasOwn(sortOptions, sort)
  ) {
    throw new ApiError(400, "Invalid sort option");
  }

  const services = await servicesCollection
    .find(filter)
    .sort(sortOptions[sort])
    .toArray();

  sendSuccess(
    res,
    services,
    "Services fetched successfully"
  );
});

// GET /api/services/mine
// Technician: fetch only their own services.

serviceRouter.get(
  "/mine",
  verifyToken,
  verifyTechnician,
  async (req, res) => {
    const services = await servicesCollection
      .find({
        technicianEmail: req.user.email,
      })
      .sort({ createdAt: -1 })
      .toArray();

    sendSuccess(
      res,
      services,
      "Your services fetched successfully"
    );
  }
);

// POST /api/services
// Technician: add a new repair service.

serviceRouter.post(
  "/",
  verifyToken,
  verifyTechnician,
  async (req, res) => {
    const serviceData = validateServiceData(req.body);

    const service = {
      ...serviceData,

      technicianName: req.user.name,
      technicianEmail: req.user.email,

      approvalStatus: "pending",
      isAvailable: true,

      createdAt: new Date(),
    };

    const result = await servicesCollection.insertOne(service);

    sendSuccess(
      res,
      {
        ...service,
        _id: result.insertedId,
      },
      "Service created successfully. Waiting for admin approval.",
      201
    );
  }
);

// GET /api/services/:id
// Public: view an approved and available service.

serviceRouter.get("/:id", async (req, res) => {
  const serviceId = validateObjectId(req.params.id);

  const service = await servicesCollection.findOne({
    _id: serviceId,
    approvalStatus: "approved",
    isAvailable: true,
  });

  if (!service) {
    throw new ApiError(404, "Service not found");
  }

  sendSuccess(
    res,
    service,
    "Service fetched successfully"
  );
});

// PATCH /api/services/:id
// Technician: edit only their own service.
// Editing resets its approval status to pending.

serviceRouter.patch(
  "/:id",
  verifyToken,
  verifyTechnician,
  async (req, res) => {
    const serviceId = validateObjectId(req.params.id);

    const serviceData = validateServiceData(
      req.body,
      true
    );

    const result = await servicesCollection.updateOne(
      {
        _id: serviceId,
        technicianEmail: req.user.email,
      },
      {
        $set: {
          ...serviceData,
          approvalStatus: "pending",
          updatedAt: new Date(),
        },
      }
    );

    if (result.matchedCount === 0) {
      throw new ApiError(
        404,
        "Service not found or you do not own this service"
      );
    }

    sendSuccess(
      res,
      null,
      "Service updated. Waiting for admin approval."
    );
  }
);

// DELETE /api/services/:id
// Technician: delete only their own service.

serviceRouter.delete(
  "/:id",
  verifyToken,
  verifyTechnician,
  async (req, res) => {
    const serviceId = validateObjectId(req.params.id);

    const result = await servicesCollection.deleteOne({
      _id: serviceId,
      technicianEmail: req.user.email,
    });

    if (result.deletedCount === 0) {
      throw new ApiError(
        404,
        "Service not found or you do not own this service"
      );
    }

    sendSuccess(
      res,
      null,
      "Service deleted successfully"
    );
  }
);

// PATCH /api/services/:id/availability
// Technician: toggle availability on their own service.

serviceRouter.patch(
  "/:id/availability",
  verifyToken,
  verifyTechnician,
  async (req, res) => {
    const serviceId = validateObjectId(req.params.id);

    const { isAvailable } = req.body;

    if (typeof isAvailable !== "boolean") {
      throw new ApiError(
        400,
        "isAvailable must be a boolean"
      );
    }

    const result = await servicesCollection.updateOne(
      {
        _id: serviceId,
        technicianEmail: req.user.email,
      },
      {
        $set: {
          isAvailable,
          updatedAt: new Date(),
        },
      }
    );

    if (result.matchedCount === 0) {
      throw new ApiError(
        404,
        "Service not found or you do not own this service"
      );
    }

    sendSuccess(
      res,
      { isAvailable },
      "Service availability updated successfully"
    );
  }
);

export default serviceRouter;
