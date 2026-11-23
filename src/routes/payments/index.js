
import { Router } from "express";
import { ObjectId } from "mongodb";

import {
  bookingCollection,
  paymentsCollection,
} from "../../config/db.js";

import { stripe } from "../../config/stripe.js";
import { env } from "../../config/env.js";

import {
  verifyToken,
  verifyCustomer,
} from "../../middleware/auth.js";

import { sendSuccess } from "../../utils/apiResponse.js";
import { ApiError } from "../../utils/ApiError.js";

const paymentsRouter = Router();

function requireStripe() {
  if (!stripe) {
    throw new ApiError(
      503,
      "Stripe is not configured on the server"
    );
  }

  return stripe;
}

function validateBookingId(id) {
  if (
    typeof id !== "string" ||
    !/^[0-9a-fA-F]{24}$/.test(id)
  ) {
    throw new ApiError(400, "Invalid booking ID");
  }

  return new ObjectId(id);
}

// Shared payment finalization function.
// Used by success-page verification and Stripe webhook.

async function finalizePaidSession(session, eventId = null) {
  if (
    !session?.id ||
    session.mode !== "payment" ||
    session.payment_status !== "paid"
  ) {
    throw new ApiError(
      409,
      "Stripe payment has not been completed"
    );
  }

  const bookingId = session.metadata?.bookingId;
  const customerEmail = session.metadata?.customerEmail;

  if (
    !bookingId ||
    !/^[0-9a-fA-F]{24}$/.test(bookingId) ||
    !customerEmail
  ) {
    throw new ApiError(
      400,
      "Invalid Stripe Checkout metadata"
    );
  }

  if (session.currency !== "usd") {
    throw new ApiError(
      400,
      "Unexpected payment currency"
    );
  }

  const bookingObjectId = new ObjectId(bookingId);

  const booking = await bookingCollection.findOne({
    _id: bookingObjectId,
    customerEmail,
  });

  if (!booking) {
    throw new ApiError(404, "Booking not found");
  }

  const finalAmount = Number(booking.finalAmount);

  if (!Number.isFinite(finalAmount) || finalAmount <= 0) {
    throw new ApiError(
      400,
      "Invalid booking final amount"
    );
  }

  const expectedCents = Math.round(finalAmount * 100);

  if (session.amount_total !== expectedCents) {
    throw new ApiError(
      409,
      "Stripe amount does not match the booking amount"
    );
  }

  const paymentIntent = session.payment_intent;

  const transactionId =
    typeof paymentIntent === "string"
      ? paymentIntent
      : paymentIntent?.id;

  if (!transactionId) {
    throw new ApiError(
      409,
      "Stripe transaction ID is not available"
    );
  }

  const bookingKey = String(booking._id);

  // Check whether this booking already has a payment record.
  // This check must happen before checking checkoutSessionId
  // because successful finalization removes checkoutSessionId.

  const existingPayment = await paymentsCollection.findOne({
    bookingId: bookingKey,
  });

  if (existingPayment) {
    if (existingPayment.stripeSessionId !== session.id) {
      throw new ApiError(
        409,
        "This booking already has a recorded payment"
      );
    }

    if (existingPayment.transactionId !== transactionId) {
      throw new ApiError(
        409,
        "Stripe transaction does not match the recorded payment"
      );
    }

    if (eventId) {
      await paymentsCollection.updateOne(
        {
          bookingId: bookingKey,
          stripeSessionId: session.id,
        },
        {
          $addToSet: {
            stripeEventIds: eventId,
          },
        }
      );
    }

    // Restore paid status safely if a repeated webhook arrives.
    await bookingCollection.updateOne(
      {
        _id: bookingObjectId,
        customerEmail,
        status: "completed",
      },
      {
        $set: {
          paymentStatus: "paid",
          paidAt: existingPayment.paidAt,
        },
        $unset: {
          checkoutSessionId: "",
        },
      }
    );

    return existingPayment;
  }

  // If there is no payment record yet, the booking must still
  // be linked to this exact Checkout Session.
  //
  // A missing ID can happen when Stripe sends its webhook
  // before the session ID is saved in MongoDB.
  // Throwing a normal error makes the webhook return 500,
  // allowing Stripe to retry instead of permanently ignoring it.

  if (!booking.checkoutSessionId) {
    throw new Error(
      "Checkout Session has not been linked to the booking yet"
    );
  }

  if (booking.checkoutSessionId !== session.id) {
    throw new ApiError(
      409,
      "Stripe Checkout Session does not match this booking"
    );
  }

  if (booking.status !== "completed") {
    throw new ApiError(
      409,
      "Only completed bookings can be paid"
    );
  }

  if (booking.paymentStatus !== "unpaid") {
    throw new ApiError(
      409,
      "This booking is not available for payment"
    );
  }

  const paidAt = session.created
    ? new Date(session.created * 1000)
    : new Date();

  const paymentDocument = {
    bookingId: bookingKey,

    serviceTitle: booking.serviceTitle,

    customerName: booking.customerName,
    customerEmail: booking.customerEmail,

    technicianName: booking.technicianName,
    technicianEmail: booking.technicianEmail,

    amount: finalAmount,
    currency: "usd",

    transactionId,
    stripeSessionId: session.id,

    paymentStatus: "paid",
    paidAt,
    createdAt: new Date(),

    stripeEventIds: eventId ? [eventId] : [],
  };

  // Unique bookingId index prevents duplicate payment records.

  try {
    await paymentsCollection.updateOne(
      {
        bookingId: bookingKey,
      },
      {
        $setOnInsert: paymentDocument,
      },
      {
        upsert: true,
      }
    );
  } catch (error) {
    if (error.code !== 11000) {
      throw error;
    }
  }

  const savedPayment = await paymentsCollection.findOne({
    bookingId: bookingKey,
  });

  if (!savedPayment) {
    throw new ApiError(
      500,
      "Unable to save payment record"
    );
  }

  if (
    savedPayment.stripeSessionId !== session.id ||
    savedPayment.transactionId !== transactionId
  ) {
    throw new ApiError(
      409,
      "This booking already has a different recorded payment"
    );
  }

  if (eventId) {
    await paymentsCollection.updateOne(
      {
        bookingId: bookingKey,
        stripeSessionId: session.id,
      },
      {
        $addToSet: {
          stripeEventIds: eventId,
        },
      }
    );
  }

  // Mark the booking as paid.
  // This is safe for repeated calls.

  await bookingCollection.updateOne(
    {
      _id: bookingObjectId,
      customerEmail,
      status: "completed",
    },
    {
      $set: {
        paymentStatus: "paid",
        paidAt: savedPayment.paidAt,
      },
      $unset: {
        checkoutSessionId: "",
      },
    }
  );

  return savedPayment;
}

// POST /api/payments/create-checkout-session
// Customer starts payment for their own completed booking.

paymentsRouter.post(
  "/create-checkout-session",
  verifyToken,
  verifyCustomer,
  async (req, res) => {
    const stripeClient = requireStripe();

    const bookingId = validateBookingId(
      req.body?.bookingId
    );

    const booking = await bookingCollection.findOne({
      _id: bookingId,
      customerEmail: req.user.email,
    });

    if (!booking) {
      throw new ApiError(404, "Booking not found");
    }

    if (booking.status !== "completed") {
      throw new ApiError(
        409,
        "Only completed bookings can be paid"
      );
    }

    if (booking.paymentStatus !== "unpaid") {
      throw new ApiError(
        409,
        "This booking has already been paid"
      );
    }

    const finalAmount = Number(booking.finalAmount);

    if (!Number.isFinite(finalAmount) || finalAmount <= 0) {
      throw new ApiError(
        400,
        "Invalid final payment amount"
      );
    }

    // Reuse an existing active Checkout Session.

    if (booking.checkoutSessionId) {
      try {
        const existingSession =
          await stripeClient.checkout.sessions.retrieve(
            booking.checkoutSessionId
          );

        if (
          existingSession.status === "open" &&
          existingSession.url
        ) {
          return sendSuccess(
            res,
            {
              checkoutUrl: existingSession.url,
              sessionId: existingSession.id,
            },
            "Existing Checkout Session retrieved"
          );
        }

        if (existingSession.payment_status === "paid") {
          await finalizePaidSession(existingSession);

          throw new ApiError(
            409,
            "This booking has already been paid"
          );
        }

        if (existingSession.status === "complete") {
          throw new ApiError(
            409,
            "Payment is being processed"
          );
        }

        await bookingCollection.updateOne(
          {
            _id: bookingId,
            customerEmail: req.user.email,
            checkoutSessionId: existingSession.id,
          },
          {
            $unset: {
              checkoutSessionId: "",
            },
          }
        );
      } catch (error) {
        if (error instanceof ApiError) {
          throw error;
        }

        if (
          error.code !== "resource_missing" &&
          error.statusCode !== 404
        ) {
          throw error;
        }

        // A missing or expired previous session can be replaced.

        await bookingCollection.updateOne(
          {
            _id: bookingId,
            customerEmail: req.user.email,
            checkoutSessionId: booking.checkoutSessionId,
          },
          {
            $unset: {
              checkoutSessionId: "",
            },
          }
        );
      }
    }

    const amountInCents = Math.round(finalAmount * 100);

    const session =
      await stripeClient.checkout.sessions.create({
        mode: "payment",

        customer_email: req.user.email,

        client_reference_id: String(booking._id),

        line_items: [
          {
            price_data: {
              currency: "usd",
              product_data: {
                name: booking.serviceTitle,
                description:
                  "FixMate completed repair service",
              },
              unit_amount: amountInCents,
            },
            quantity: 1,
          },
        ],

        metadata: {
          bookingId: String(booking._id),
          customerEmail: req.user.email,
        },

        success_url:
          `${env.CLIENT_URL}/payment/success?session_id={CHECKOUT_SESSION_ID}`,

        cancel_url:
          `${env.CLIENT_URL}/payment/cancel?bookingId=${booking._id}`,
      });

    // Store the active session so repeated clicks reuse it.

    const savedSession = await bookingCollection.updateOne(
      {
        _id: bookingId,
        customerEmail: req.user.email,
        status: "completed",
        paymentStatus: "unpaid",
        $or: [
          { checkoutSessionId: { $exists: false } },
          { checkoutSessionId: null },
        ],
      },
      {
        $set: {
          checkoutSessionId: session.id,
          updatedAt: new Date(),
        },
      }
    );

    if (savedSession.matchedCount === 0) {
      // Another concurrent request may have created a session.
      // Expire the unused session and reuse the winning session.

      await stripeClient.checkout.sessions
        .expire(session.id)
        .catch(() => {});

      const latestBooking = await bookingCollection.findOne({
        _id: bookingId,
        customerEmail: req.user.email,
      });

      if (latestBooking?.checkoutSessionId) {
        const winningSession =
          await stripeClient.checkout.sessions.retrieve(
            latestBooking.checkoutSessionId
          );

        if (
          winningSession.status === "open" &&
          winningSession.url
        ) {
          return sendSuccess(
            res,
            {
              checkoutUrl: winningSession.url,
              sessionId: winningSession.id,
            },
            "Checkout Session retrieved"
          );
        }
      }

      throw new ApiError(
        409,
        "Unable to start checkout. Please refresh and try again."
      );
    }

    sendSuccess(
      res,
      {
        checkoutUrl: session.url,
        sessionId: session.id,
      },
      "Stripe Checkout Session created successfully"
    );
  }
);

// GET /api/payments/verify?session_id=...
// Customer success page verifies payment with Stripe.

paymentsRouter.get(
  "/verify",
  verifyToken,
  verifyCustomer,
  async (req, res) => {
    const stripeClient = requireStripe();

    const sessionId = req.query.session_id;

    if (
      typeof sessionId !== "string" ||
      !sessionId.startsWith("cs_")
    ) {
      throw new ApiError(
        400,
        "Invalid Stripe Checkout Session ID"
      );
    }

    const session =
      await stripeClient.checkout.sessions.retrieve(
        sessionId
      );

    if (
      session.metadata?.customerEmail !== req.user.email
    ) {
      throw new ApiError(
        403,
        "This payment does not belong to you"
      );
    }

    const payment = await finalizePaidSession(session);

    sendSuccess(
      res,
      {
        amount: payment.amount,
        currency: payment.currency,
        transactionId: payment.transactionId,
        paidAt: payment.paidAt,
        serviceTitle: payment.serviceTitle,
      },
      "Payment verified successfully"
    );
  }
);

// GET /api/payments/my
// Customer payment history.

paymentsRouter.get(
  "/my",
  verifyToken,
  verifyCustomer,
  async (req, res) => {
    const payments = await paymentsCollection
      .find({
        customerEmail: req.user.email,
        paymentStatus: "paid",
      })
      .sort({ paidAt: -1 })
      .toArray();

    sendSuccess(
      res,
      payments,
      "Payment history fetched successfully"
    );
  }
);

// Stripe webhook handler.
// This endpoint receives the raw request body.

export async function stripeWebhookHandler(req, res) {
  if (!stripe || !env.STRIPE_WEBHOOK_SECRET) {
    return res.status(503).json({
      success: false,
      message: "Stripe webhook is not configured",
    });
  }

  const signature = req.headers["stripe-signature"];

  let event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      signature,
      env.STRIPE_WEBHOOK_SECRET
    );
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: `Webhook signature verification failed: ${error.message}`,
    });
  }

  try {
    if (
      event.type === "checkout.session.completed" ||
      event.type === "checkout.session.async_payment_succeeded"
    ) {
      const session = event.data.object;

      if (session.payment_status === "paid") {
        await finalizePaidSession(session, event.id);
      }
    }

    if (event.type === "checkout.session.expired") {
      const session = event.data.object;
      const bookingId = session.metadata?.bookingId;

      if (
        bookingId &&
        /^[0-9a-fA-F]{24}$/.test(bookingId)
      ) {
        await bookingCollection.updateOne(
          {
            _id: new ObjectId(bookingId),
            checkoutSessionId: session.id,
            paymentStatus: "unpaid",
          },
          {
            $unset: {
              checkoutSessionId: "",
            },
          }
        );
      }
    }
  } catch (error) {
    // Business validation errors are acknowledged.
    // Unexpected errors return 500 so Stripe can retry.

    if (
      error.statusCode &&
      error.statusCode >= 400 &&
      error.statusCode < 500
    ) {
      console.error(
        "Stripe webhook business validation failed:",
        error.message
      );

      return res.status(200).json({
        received: true,
        ignored: true,
      });
    }

    console.error("Stripe webhook processing failed:", error);

    return res.status(500).json({
      received: false,
      message: "Webhook processing failed",
    });
  }

  return res.status(200).json({
    received: true,
  });
}

export default paymentsRouter;
