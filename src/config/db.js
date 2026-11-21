
import { MongoClient } from "mongodb";
import { env } from "./env.js";

export const DB_NAME = "fixmate";

const client = new MongoClient(env.DB_URI);

const db = client.db(DB_NAME);

export const usersCollection = db.collection("users");
export const servicesCollection = db.collection("services");
export const bookingCollection = db.collection("bookings");
export const paymentsCollection = db.collection("payments");

// Connect to MongoDB and prepare database indexes.
export async function connectDB() {
  await client.connect();

  await db.command({ ping: 1 });

  // One payment per booking.
  await paymentsCollection.createIndex(
    { bookingId: 1 },
    {
      unique: true,
      name: "unique_payment_per_booking",
      partialFilterExpression: {
        bookingId: { $type: "string" },
      },
    }
  );

  // One record per Stripe Checkout Session.
  await paymentsCollection.createIndex(
    { stripeSessionId: 1 },
    {
      unique: true,
      name: "unique_stripe_session",
      partialFilterExpression: {
        stripeSessionId: { $type: "string" },
      },
    }
  );

  return db;
}

// Close the MongoDB connection.
export async function closeDB() {
  await client.close();
}
