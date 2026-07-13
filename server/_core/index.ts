import "dotenv/config";
import express, { Request, Response, NextFunction } from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerStorageProxy } from "./storageProxy";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { slackRouter } from "../slack";
import { ghlRouter } from "../ghl";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  const server = createServer(app);

  // Capture raw body for Slack signature verification BEFORE json parsing
  // Skip for /slack/ghl which handles its own body parsing
  app.use("/slack", (req: Request, _res: Response, next: NextFunction) => {
    if (req.path === "/ghl" || req.path === "/ghl-webhook" || req.path === "/proof-status" || req.path === "/dealership-sync" || req.path === "/push-campaign-values" || req.path === "/create-channel" || req.path === "/backfill-archive-jobs" || req.path === "/reschedule-archive" ||
      req.path === "/backfill-warning-jobs") {
      return next();
    }
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      (req as Request & { rawBody?: Buffer }).rawBody = Buffer.concat(chunks);
      next();
    });
    req.on("error", next);
  });

  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  registerStorageProxy(app);
  registerOAuthRoutes(app);

  // Slack event relay
  app.use("/slack", slackRouter);
  // GHL slash command handler (mounted at /slack)
  app.use("/slack", ghlRouter);
  // GHL scheduled callbacks (heartbeat requires /api/scheduled/ prefix at root)
  app.use("/api", ghlRouter);

  // Health / root route
  app.get("/", (_req: Request, res: Response) => {
    res.setHeader("Content-Type", "text/html");
    res.send(`<!doctype html><html><head><title>Slack→Make Relay</title></head><body style="font-family:monospace;padding:2rem"><h2>&#x2705; Slack &#x2192; Make Relay is live</h2><p>POST <code>/slack/events</code> to receive Slack events.</p></body></html>`);
  });
  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer().catch(console.error);
