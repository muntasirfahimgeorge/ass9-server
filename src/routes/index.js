
import { Router } from "express";
import { sendSuccess } from "../utils/apiResponse.js";

import usersRouter from "./users/index.js";
import bookingsRouter from "./bookings/index.js";
import serviceRouter from "./services/index.js";
import adminRouter from "./admin/index.js";
import paymentsRouter from "./payments/index.js";

const router = Router();

router.get("/health", (req, res) => {
  sendSuccess(
    res,
    {
      status: "ok",
      application: "FixMate API",
    },
    "FixMate server is running"
  );
});

router.use("/users", usersRouter);
router.use("/services", serviceRouter);
router.use("/bookings", bookingsRouter);
router.use("/admin", adminRouter);
router.use("/payments", paymentsRouter);

export default router;
