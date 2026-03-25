import { Router } from "express";
import { handleRotate } from "../controllers/logRotateController";

const router = Router();

router.get("/rotate", handleRotate);

export default router;
