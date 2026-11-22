
import { Router } from "express";
import { ObjectId } from "mongodb";

import {
  usersCollection,
  servicesCollection,
  bookingCollection,
  paymentsCollection,
} from "../../config/db.js";

import {
  verifyToken,
  verifyAdmin,
} from "../../middleware/auth.js";

import { sendSuccess } from "../../utils/apiResponse.js";
import { ApiError } from "../../utils/ApiError.js";

const adminRouter = Router();

const USER_ROLES = [
  "customer",
  "technician",
  "admin",
];

const BOOKING_STATUSES = [
  "requested",
  "accepted",
  "rejected",
  "in-progress",
  "completed",
  "cancelled",
];

const SERVICE_APPROVAL_STATUSES = [
  "all",
  "pending",
  "approved",
  "rejected",
];

// Every admin endpoint requires authentication and admin role.
adminRouter.use(verifyToken, verifyAdmin);

// GET /api/admin/users
// Get all registered users.

adminRouter.get("/users", async (req, res) => {
  const users = await usersCollection
    .find(
      {},
      {
        projection: {
          name: 1,
          email: 1,
          image: 1,
          role: 1,
          phone: 1,
          area: 1,
          bio: 1,
          createdAt: 1,
          emailVerified: 1,
        },
      }
    )
    .sort({ createdAt: -1 })
    .toArray();

  sendSuccess(
    res,
    users,
    "Users fetched successfully"
  );
});

// GET /api/admin/services
// Get all services with an optional approval status filter.

adminRouter.get("/services", async (req, res) => {
  const { approvalStatus = "all" } = req.query;

  if (
    typeof approvalStatus !== "string" ||
    !SERVICE_APPROVAL_STATUSES.includes(approvalStatus)
  ) {
    throw new ApiError(
      400,
      "Invalid service approval status"
    );
  }

  const filter = {};

  if (approvalStatus !== "all") {
    filter.approvalStatus = approvalStatus;
  }

  const services = await servicesCollection
    .find(filter)
    .sort({ createdAt: -1, _id: -1 })
    .toArray();

  sendSuccess(
    res,
    services,
    "Admin services fetched successfully"
  );
});

// PATCH /api/admin/users/:id/role
// Change a user's role.
// Admin cannot change their own role.

adminRouter.patch("/users/:id/role", async (req, res) => {
  const id = req.params.id;
  const { role } = req.body;

  if (
    !ObjectId.isValid(id) ||
    !/^[0-9a-fA-F]{24}$/.test(id)
  ) {
    throw new ApiError(400, "Invalid user ID");
  }

  if (!USER_ROLES.includes(role)) {
    throw new ApiError(400, "Invalid user role");
  }

  const userId = new ObjectId(id);

  const targetUser = await usersCollection.findOne({
    _id: userId,
  });

  if (!targetUser) {
    throw new ApiError(404, "User not found");
  }

  const targetId = String(
    targetUser.id ?? targetUser._id
  );

  if (
    targetId === String(req.user.id) ||
    String(targetUser._id) === String(req.user.id)
  ) {
    throw new ApiError(
      403,
      "You cannot change your own role"
    );
  }

  await usersCollection.updateOne(
    { _id: userId },
    {
      $set: {
        role,
        updatedAt: new Date(),
      },
    }
  );

  sendSuccess(
    res,
    { userId: id, role },
    "User role updated successfully"
  );
});

// PATCH /api/admin/services/:id/approval
// Approve or reject a technician's service.

adminRouter.patch(
  "/services/:id/approval",
  async (req, res) => {
    const id = req.params.id;
    const { approvalStatus } = req.body;

    if (
      !ObjectId.isValid(id) ||
      !/^[0-9a-fA-F]{24}$/.test(id)
    ) {
      throw new ApiError(400, "Invalid service ID");
    }

    if (
      !["approved", "rejected"].includes(approvalStatus)
    ) {
      throw new ApiError(
        400,
        "Approval status must be approved or rejected"
      );
    }

    const result = await servicesCollection.updateOne(
      {
        _id: new ObjectId(id),
      },
      {
        $set: {
          approvalStatus,
          reviewedAt: new Date(),
        },
      }
    );

    if (result.matchedCount === 0) {
      throw new ApiError(404, "Service not found");
    }

    sendSuccess(
      res,
      { approvalStatus },
      `Service ${approvalStatus} successfully`
    );
  }
);

// GET /api/admin/bookings
// Monitor all bookings with an optional status filter.

adminRouter.get("/bookings", async (req, res) => {
  const { status } = req.query;

  const filter = {};

  if (status && status !== "all") {
    if (
      typeof status !== "string" ||
      !BOOKING_STATUSES.includes(status)
    ) {
      throw new ApiError(
        400,
        "Invalid booking status"
      );
    }

    filter.status = status;
  }

  const bookings = await bookingCollection
    .find(filter)
    .sort({ preferredDate: -1, _id: -1 })
    .toArray();

  sendSuccess(
    res,
    bookings,
    "All bookings fetched successfully"
  );
});

// GET /api/admin/payments
// View transactions and total revenue.

adminRouter.get("/payments", async (req, res) => {
  const [payments, revenueResult] = await Promise.all([
    paymentsCollection
      .find({ paymentStatus: "paid" })
      .sort({ paidAt: -1 })
      .toArray(),

    paymentsCollection
      .aggregate([
        {
          $match: {
            paymentStatus: "paid",
          },
        },
        {
          $group: {
            _id: null,
            totalRevenue: {
              $sum: "$amount",
            },
            totalTransactions: {
              $sum: 1,
            },
          },
        },
      ])
      .toArray(),
  ]);

  const summary = revenueResult[0] ?? {
    totalRevenue: 0,
    totalTransactions: 0,
  };

  sendSuccess(
    res,
    {
      payments,
      totalRevenue: summary.totalRevenue,
      totalTransactions: summary.totalTransactions,
    },
    "Payment transactions fetched successfully"
  );
});

export default adminRouter;
