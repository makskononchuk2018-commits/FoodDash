import "dotenv/config";
import express, { type Request, type Response, type NextFunction, type Express } from "express";
import path from "path";
import { createServer, type Server } from "http";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createSessionMiddleware, hydrateSessionUser } from "./auth";
import { databaseConfigError } from "./db";

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

export type CreateAppOptions = {
  serveClient?: boolean;
};

export type CreatedApp = {
  app: Express;
  httpServer: Server;
};

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

function wrapAsyncRouteHandlers(app: Express) {
  const methods = ["get", "post", "put", "patch", "delete"] as const;

  for (const method of methods) {
    const original = app[method].bind(app) as (...args: any[]) => Express;

    (app as any)[method] = (...args: any[]) =>
      original(
        ...args.map((handler) => {
          if (typeof handler !== "function" || handler.length > 3) {
            return handler;
          }

          return function asyncRouteHandler(req: Request, res: Response, next: NextFunction) {
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

export async function createApp(options: CreateAppOptions = {}): Promise<CreatedApp> {
  const app = express();
  const httpServer = createServer(app);

  wrapAsyncRouteHandlers(app);

  if (process.env.NODE_ENV === "production") {
    app.set("trust proxy", 1);
  }

  const configError = databaseConfigError;

  if (configError) {
    app.use("/api", (_req, res) => {
      res.status(500).json({
        message: "Database configuration error",
        detail: configError.message,
      });
    });

    if (options.serveClient) {
      serveStatic(app);
    }

    return { app, httpServer };
  }

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

  app.use("/uploads", express.static(path.resolve(process.cwd(), "uploads")));

  app.use((req, res, next) => {
    const start = Date.now();
    const requestPath = req.path;
    let capturedJsonResponse: Record<string, any> | undefined = undefined;

    const originalResJson = res.json;
    res.json = function (bodyJson, ...args) {
      capturedJsonResponse = bodyJson;
      return originalResJson.apply(res, [bodyJson, ...args]);
    };

    res.on("finish", () => {
      const duration = Date.now() - start;
      if (requestPath.startsWith("/api")) {
        let logLine = `${req.method} ${requestPath} ${res.statusCode} in ${duration}ms`;
        if (capturedJsonResponse) {
          logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
        }

        log(logLine);
      }
    });

    next();
  });

  await registerRoutes(httpServer, app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });

    if (process.env.NODE_ENV !== "production") {
      console.error("[express:error]", err);
    }
  });

  if (options.serveClient) {
    serveStatic(app);
  }

  return { app, httpServer };
}
