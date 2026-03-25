import { Router } from "express";
import { issueToken } from "../controllers/auth.controller";
import { getRequiredRouteScopes } from "../controllers/auth-required-scopes.controller";
import { requireApiKey } from "../middleware/api-key";

const router = Router();

router.post("/token", issueToken);
router.get("/required-scopes", requireApiKey, getRequiredRouteScopes);

export default router;
