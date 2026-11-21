
import { Router } from "express";
import { ObjectId } from "mongodb";

import {
  bookingCollection,
  servicesCollection,
} from "../../config/db.js";

import {
  verifyToken,
  verifyCustomer,
  verifyTechnician,
} from "../../middleware/auth.js";

import { sendSuccess } from "../../utils/apiResponse.js";
import { ApiError } from "../../utils/ApiError.js";

const router = Router();

const ACTIVE_STATUSES = [
  "requested",
  "accepted",
  "in-progress",
];

const ALLOWED_TRANSITIONS = {
  requested: ["accepted", "rejected"],
  accepted: ["in-progress"],
  "in-progress": ["completed"],
};

function validateBookingId(id) {
  if (
    !ObjectId.isValid(id) ||
    !/^[0-9a-fA-F]{24}$/.test(id)
  ) {
    throw new ApiError(400, "Invalid booking ID");
  }

  return new ObjectId(id);
}

function getTodayInDhaka() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Dhaka",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

// POST /api/bookings
// Customer creates a repair request.

router.post(
  "/",
  verifyToken,
  verifyCustomer,
  async (req, res) => {
    const {
      serviceId,
      customerPhone,
      address,
      preferredDate,
      problemDescription,
    } = req.body;

    if (
      typeof serviceId !== "string" ||
      !/^[0-9a-fA-F]{24}$/.test(serviceId)
    ) {
      throw new ApiError(400, "Invalid service ID");
    }

    if (
      typeof customerPhone !== "string" ||
      customerPhone.trim().length < 7 ||
      customerPhone.trim().length > 20
    ) {
      throw new ApiError(400, "Enter a valid phone number");
    }

    if (
      typeof address !== "string" ||
      address.trim().length < 5
    ) {
      throw new ApiError(400, "Enter a valid address");
    }

    if (
      typeof preferredDate !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(preferredDate)
    ) {
      throw new ApiError(400, "Invalid preferred date");
    }

    const [year, month, day] = preferredDate
  .split("-")
  .map(Number);

const selectedDate = new Date(
  Date.UTC(year, month - 1, day)
);

if (
  selectedDate.getUTCFullYear() !== year ||
  selectedDate.getUTCMonth() !== month - 1 ||
  selectedDate.getUTCDate() !== day
) {
  throw new ApiError(400, "Invalid preferred date");
}

    if (preferredDate < getTodayInDhaka()) {
      throw new ApiError(
        400,
        "Preferred date cannot be in the past"
      );
    }

    if (
      typeof problemDescription !== "string" ||
      problemDescription.trim().length < 20
    ) {
      throw new ApiError(
        400,
        "Problem description must contain at least 20 characters"
      );
    }

    const service = await servicesCollection.findOne({
      _id: new ObjectId(serviceId),
      approvalStatus: "approved",
      isAvailable: true,
    });

    if (!service) {
      throw new ApiError(
        404,
        "Service not found or currently unavailable"
      );
    }

    if (service.technicianEmail === req.user.email) {
      throw new ApiError(
        403,
        "You cannot request your own service"
      );
    }

    // Prevent duplicate active requests.
    const existingBooking = await bookingCollection.findOne({
      serviceId,
      customerEmail: req.user.email,
      status: { $in: ACTIVE_STATUSES },
    });

    if (existingBooking) {
      throw new ApiError(
        409,
        "You already have an active request for this service"
      );
    }

    const booking = {
      serviceId,

      serviceTitle: service.title,
      serviceImage: service.image,
      category: service.category,

      basePrice: service.basePrice,
      finalAmount: service.basePrice,

      technicianName: service.technicianName,
      technicianEmail: service.technicianEmail,

      customerName: req.user.name,
      customerEmail: req.user.email,

      customerPhone: customerPhone.trim(),
      address: address.trim(),

      preferredDate: selectedDate,
      problemDescription: problemDescription.trim(),

      status: "requested",
      paymentStatus: "unpaid",

      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await bookingCollection.insertOne(booking);

    sendSuccess(
      res,
      {
        ...booking,
        _id: result.insertedId,
      },
      "Repair request submitted successfully",
      201
    );
  }
);

// GET /api/bookings/my
// Customer can see only their own bookings.

router.get(
  "/my",
  verifyToken,
  verifyCustomer,
  async (req, res) => {
    const bookings = await bookingCollection
      .find({
        customerEmail: req.user.email,
      })
      .sort({ createdAt: -1 })
      .toArray();

    sendSuccess(
      res,
      bookings,
      "Your bookings fetched successfully"
    );
  }
);

// PATCH /api/bookings/:id/cancel
// Customer can cancel only requested bookings.

router.patch(
  "/:id/cancel",
  verifyToken,
  verifyCustomer,
  async (req, res) => {
    const bookingId = validateBookingId(req.params.id);

    const result = await bookingCollection.updateOne(
      {
        _id: bookingId,
        customerEmail: req.user.email,
        status: "requested",
      },
      {
        $set: {
          status: "cancelled",
          updatedAt: new Date(),
        },
      }
    );

    if (result.matchedCount === 0) {
      const booking = await bookingCollection.findOne({
        _id: bookingId,
        customerEmail: req.user.email,
      });

      if (!booking) {
        throw new ApiError(404, "Booking not found");
      }

      throw new ApiError(
        409,
        "Only requested bookings can be cancelled"
      );
    }

    sendSuccess(
      res,
      null,
      "Booking cancelled successfully"
    );
  }
);

// GET /api/bookings/technician
// Technician can see only their assigned bookings.

router.get(
  "/technician",
  verifyToken,
  verifyTechnician,
  async (req, res) => {
    const { status } = req.query;

    const filter = {
      technicianEmail: req.user.email,
    };

    if (status && status !== "all") {
      const validStatuses = [
        ...Object.keys(ALLOWED_TRANSITIONS),
        "rejected",
        "cancelled",
      ];

      if (
        typeof status !== "string" ||
        !validStatuses.includes(status)
      ) {
        throw new ApiError(400, "Invalid booking status");
      }

      filter.status = status;
    }

    const bookings = await bookingCollection
      .find(filter)
      .sort({ createdAt: -1 })
      .toArray();

    sendSuccess(
      res,
      bookings,
      "Technician bookings fetched successfully"
    );
  }
);

// PATCH /api/bookings/:id/status
// Technician can update only their own booking.
// Enforces the job status pipeline on the server.

router.patch(
  "/:id/status",
  verifyToken,
  verifyTechnician,
  async (req, res) => {
    const bookingId = validateBookingId(req.params.id);

    const { status, finalAmount } = req.body;

    const booking = await bookingCollection.findOne({
      _id: bookingId,
      technicianEmail: req.user.email,
    });

    if (!booking) {
      throw new ApiError(
        404,
        "Booking not found or you do not own this booking"
      );
    }

    const allowedNextStatuses =
      ALLOWED_TRANSITIONS[booking.status] || [];

    if (!allowedNextStatuses.includes(status)) {
      throw new ApiError(
        400,
        `Transition from ${booking.status} to ${status} is not allowed`
      );
    }

    const updateData = {
      status,
      updatedAt: new Date(),
    };

    if (status === "completed") {
      const amount = Number(finalAmount);

      if (!Number.isFinite(amount) || amount <= 0) {
        throw new ApiError(
          400,
          "Final amount must be a number greater than zero"
        );
      }

      updateData.finalAmount = amount;
    }

    const result = await bookingCollection.updateOne(
      {
        _id: bookingId,
        technicianEmail: req.user.email,
        status: booking.status,
      },
      {
        $set: updateData,
      }
    );

    if (result.matchedCount === 0) {
      throw new ApiError(
        409,
        "Booking status changed. Refresh and try again."
      );
    }

    sendSuccess(
      res,
      updateData,
      `Booking status updated to ${status}`
    );
  }
);

export default router;
