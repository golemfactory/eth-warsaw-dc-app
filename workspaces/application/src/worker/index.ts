import "dotenv/config";
import { makeRascalConfig } from "../shared/config";
import { BrokerAsPromised as Broker } from "rascal";
import { AppDataSource } from "../shared/db/data-source";
import { ComputeValueJobResult } from "../shared/db/entity/ComputeValueJobResult";
import os from "node:os";
import cluster from "node:cluster";

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
    console.debug("Staring up worker process", process.pid);

    console.log("Connecting to DB");
    await AppDataSource.initialize();
    console.log("Connected to DB");

    const config = makeRascalConfig(
      process.env.AMQP_URL ?? "amqp://localhost",
      "worker-process",
    );

    console.log("Connecting to broker");
    const broker = await Broker.create(config);
    console.log("Opened broker connection");

    const resultRepo = AppDataSource.getRepository(ComputeValueJobResult);

    // Start consuming jobs
    const subscription = await broker.subscribe("worker-add");

    subscription.on("message", async (msg, content, ackOrNack) => {
      try {
        const jobArgs = JSON.parse(content.toString());
        console.log("JOB Args", jobArgs);

        const job = await resultRepo.findOneByOrFail({
          id: jobArgs.id,
        });

        job.result = job.argA + job.argB;

        await resultRepo.save(job);

        ackOrNack();
      } catch (err) {
        console.error("Failed to process the message", err);
        ackOrNack(err as Error);
      }
    });

    const shutdown = async () => {
      console.log("Cancelling subscription");
      await subscription.cancel();
      console.log("Subscription cancelled");

      console.log("Closing broker connection");
      await broker.shutdown();
      console.log("Closed the broker connection");

      console.log("Disconnecting from DB");
      await AppDataSource.destroy();
      console.log("Disconnected from DB");
    };

    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);

    console.log("Worker startup finished", process.pid);
  }
})().catch((err) => {
  console.error("Failed to run the WORKER process", err);
  process.exit(1);
});
