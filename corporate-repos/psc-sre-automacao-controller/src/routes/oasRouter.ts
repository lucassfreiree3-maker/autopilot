import { Router } from "express";
import { requireJwt } from "../middleware/jwt";
import { requireScopes } from "../middleware/scopes";
import { requireOasOriginOrJwt } from "../middleware/oas-origin-auth";
import { SCOPES } from "../auth/scopes";
import {
  postOasAutomation,
  listOasAutomations,
  getOasAutomation,
} from "../controllers/oas-execute.controller";
import { postOasSreController } from "../controllers/oas-sre-controller.controller";

const router = Router();

// Keep OAS routes grouped here so release diffs stay easy to audit.
// POST /oas/sre-controller - Entrada unica para execucao de automacoes via TechBB/OAS
router.post(
  "/sre-controller",
  requireOasOriginOrJwt([SCOPES.EXECUTE]),
  postOasSreController,
);

// GET /oas/automations - Lista todas automacoes
router.get(
  "/automations",
  requireJwt,
  requireScopes([SCOPES.READ]),
  listOasAutomations,
);

// GET /oas/automations/{automation} - Metadados de uma automacao
router.get(
  "/automations/:automation",
  requireJwt,
  requireScopes([SCOPES.READ]),
  getOasAutomation,
);

// POST /oas/automations/{automation} - Executa automacao
router.post(
  "/automations/:automation",
  requireJwt,
  requireScopes([SCOPES.EXECUTE]),
  postOasAutomation,
);

export default router;
