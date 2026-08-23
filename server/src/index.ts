import express from "express";
import "dotenv/config"
import { auth } from "./lib/auth.js";
import { toNodeHandler } from "better-auth/node";
import cors from "cors"
import { registerRoutes } from "./routes";
import { errorHandler } from "./middleware/handler-middleware.js";
import {functions } from "./inngest/index.js"
import { serve } from "inngest/express";
import {  inngest } from "./inngest/client.js"

const app = express();
const PORT = process.env.PORT
const clientUrl = process.env.CLIENT_URL ?? "http://localhost:3000"

app.use(
    cors({
        origin: clientUrl,
        credentials: true,
        exposedHeaders: ["X-Conversation-Id"],
    }),
)

app.all("/api/auth/{*key}", toNodeHandler(auth));
// Mount express json middleware after Better Auth handler
// or only apply it to routes that don't interact with Better Auth
app.use(express.json());

// Set up the "/api/inngest" (recommended) routes with the serve handler
app.use("/api/inngest", serve({ client: inngest, functions }));

app.get("/", (req, res) => {
    res.send("halo World")
})


registerRoutes(app)
app.use(errorHandler)


app.listen(PORT, () => {
    console.log(`Server is running on port http://localhost:${PORT}`)
})

