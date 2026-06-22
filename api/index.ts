import type { Express } from "express";
import { createApp } from "../server/app";

let appPromise: Promise<Express> | undefined;

function getApp() {
  appPromise ??= createApp({ serveClient: false }).then(({ app }) => app);
  return appPromise;
}

function normalizeApiUrl(req: { url?: string; query?: Record<string, unknown> }) {
  const rawPath = typeof req.query?.path === "string" ? req.query.path : "";

  if (!rawPath) {
    return;
  }

  const [incomingPath, incomingQuery = ""] = (req.url || "").split("?");
  const searchParams = new URLSearchParams(incomingQuery);
  searchParams.delete("path");

  const normalizedPath = `/api/${rawPath.replace(/^\/+/, "")}`;
  const normalizedQuery = searchParams.toString();

  req.url = normalizedQuery ? `${normalizedPath}?${normalizedQuery}` : normalizedPath;

  if (incomingPath === normalizedPath) {
    return;
  }
}

export default async function handler(req: any, res: any) {
  normalizeApiUrl(req);

  const app = await getApp();
  return app(req, res);
}
