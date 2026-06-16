import type { NextFunction, Request, Response } from "express";

/** Wrap an async handler so thrown errors reach the Express error middleware. */
export const ah =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res, next).catch(next);
  };
