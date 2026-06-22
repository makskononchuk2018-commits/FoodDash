import "dotenv/config";
import express, { type Express, type Request, Response, NextFunction } from "express";
import path from "path";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { createSessionMiddleware, hydrateSessionUser } from "./auth";

const app = express();
const httpServer = createServer(app);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

wrapAsyncRouteHandlers();

app.use(createSessionMiddleware());
app.use(hydrateSessionUser);

app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));

// Serve uploaded images
app.use("/uploads", express.static(path.resolve(process.cwd(), "uploads")));

function wrapAsyncRouteHandlers() {
  const methods = ["get", "post", "put", "patch", "delete"] as const;

  for (const method of methods) {
    const original = app[method].bind(app) as (...args: any[]) => Express;

    (app as any)[method] = (...args: any[]) =>
      original(
        ...args.map((handler) => {
          if (typeof handler !== "function" || handler.length > 3) {
            return handler;
          }

          return function asyncRouteHandler(
            req: Request,
            res: Response,
            next: NextFunction,
          ) {
            try {
              const result = handler(req, res, next);

              if (result && typeof result.then === "function") {
                return result.catch(next);
              }

              return result;
            } catch (error) {
              return next(error);
            }
          };
        }),
      );
  }
}

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  await registerRoutes(httpServer, app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });

    if (process.env.NODE_ENV !== "production") {
      console.error("[express:error]", err);
    }
  });

  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(
    {
      port,
      host: "127.0.0.1",
      reusePort: true,
    },
    () => {
      log(`serving on port ${port}`);
    },
  );
})();