import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../auth";
import { getDashboardData, type DashboardPeriod } from "../services/dashboard-service";

const router = Router();

router.get("/api/dashboard", requireAuth, async (req, res, next) => {
  const parsed = z.enum(["today", "week", "month", "all-time"]).safeParse(
    req.query.period ?? "today",
  );
  if (!parsed.success) {
    res.status(400).json({ error: "Choose today, week, month, or all-time for the dashboard period" });
    return;
  }
  try {
    res.json(await getDashboardData(parsed.data as DashboardPeriod));
  } catch (error) {
    next(error);
  }
});

export default router;
