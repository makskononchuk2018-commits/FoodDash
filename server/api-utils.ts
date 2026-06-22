import type { Response } from "express";

export function sendValidationError(res: Response, message: string, field?: string) {
  return res.status(400).json({ message, field });
}

export function sendNotFound(res: Response, message: string) {
  return res.status(404).json({ message });
}

export function sendConflict(res: Response, message: string) {
  return res.status(409).json({ message });
}
