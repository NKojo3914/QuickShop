import { Router, type IRouter } from "express";
import healthRouter from "./health";
import storageRouter from "./storage";

const router: IRouter = Router();

router.use(healthRouter);
router.use(storageRouter);

// Local dev ergonomics: allow running the API without a database configured.
// Routes that require Postgres are only mounted when DATABASE_URL is present.
if (process.env.DATABASE_URL) {
  const authRouter = (await import("./auth")).default;
  const storesRouter = (await import("./stores")).default;
  const productsRouter = (await import("./products")).default;
  const telegramRouter = (await import("./telegram")).default;
  const ordersRouter = (await import("./orders")).default;
  const searchRouter = (await import("./search")).default;
  const paymentsRouter = (await import("./payments")).default;
  const reviewsRouter = (await import("./reviews")).default;
  const analyticsRouter = (await import("./analytics")).default;
  const promoCodesRouter = (await import("./promoCodes")).default;

  router.use(authRouter);
  router.use(storesRouter);
  router.use(productsRouter);
  router.use(telegramRouter);
  router.use(ordersRouter);
  router.use(searchRouter);
  router.use(paymentsRouter);
  router.use(reviewsRouter);
  router.use(analyticsRouter);
  router.use(promoCodesRouter);
}

export default router;
