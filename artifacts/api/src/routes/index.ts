import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import tenantRouter from "./tenant";
import teamRouter from "./team";
import companiesRouter from "./companies";

const router: IRouter = Router();
router.use(healthRouter);
router.use(authRouter);
router.use(tenantRouter);
router.use(companiesRouter);
router.use(teamRouter);

export default router;
