import "dotenv/config";
import { makeRascalConfig } from "../shared/config";
import { BrokerAsPromised as Broker } from "rascal";
import { createApp } from "./app";
import * as http from "node:http";
import { AppDataSource } from "../shared/db/data-source";
import cluster from "node:cluster";
import os from "node:os";

(async () => {
  const PARALLELISM = process.env["PARALLELISM"]
    ? parseInt(process.env["PARALLELISM"])
    : os.availableParallelism();

  if (cluster.isPrimary) {
    console.log("Starting primary", process.pid);

    if (Number.isNaN(PARALLELISM) || PARALLELISM < 1) {
      throw new Error("The PARALLELISM setting has to be set to at-least 1");
    }

    // Fork workers
    for (let i = 0; i < PARALLELISM; i++) {
      cluster.fork();
    }

    cluster.on("exit", (worker, code, signal) => {
      console.log(`Worker ${worker.process.pid} died`, code, signal);
    });
  } else {
    console.log("Starting worker", process.pid);

    console.log("Connecting to DB");
    await AppDataSource.initialize();
    console.log("Connected to DB");

    const config = makeRascalConfig(
      process.env.AMQP_URL ?? "amqp://localhost",
      "api-server",
    );

    console.log("Connecting to broker");
    const broker = await Broker.create(config);
    console.log("Opened broker connection");

    const app = createApp(broker);

    const PORT = parseInt(process.env.PORT ?? "8080");

    const server = await new Promise<http.Server>((resolve) => {
      const server = app.listen(PORT, "0.0.0.0", () => {
        resolve(server);
      });
    });

    console.log("HTTP server started on port", PORT);

    const shutdown = async () => {
      console.log("Closing HTTP server");
      await new Promise<void>((resolve) => {
        server.close(() => {
          resolve();
          console.log("HTTP server closed");
        });
      });
      console.log("Closing broker connection");
      await broker.shutdown();
      console.log("Closed the broker connection");

      console.log("Disconnecting from DB");
      await AppDataSource.destroy();
      console.log("Disconnected from DB");
    };

    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
  }
})().catch((err) => {
  console.error("Failed to run the API process", err);
  process.exit(1);
});
