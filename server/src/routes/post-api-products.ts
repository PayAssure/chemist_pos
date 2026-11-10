import { Router } from "express";
import { requireAuth } from "../auth";
import { createProduct } from "../services/product-creation";

const router = Router();

router.post("/api/products", requireAuth, createProduct);

export default router;
