import express from "express";
import { BrokerAsPromised } from "rascal";
import { AppDataSource } from "../shared/db/data-source";
import { ComputeValueJobResult } from "../shared/db/entity/ComputeValueJobResult";

export function createApp(broker: BrokerAsPromised) {
  const app = express();

  const resultRepo = AppDataSource.getRepository(ComputeValueJobResult);

  app.use(express.json());

  app.post("/add", async (req, res) => {
    try {
      const argA = parseInt(req.body.a);
      const argB = parseInt(req.body.b);

      const newJob = resultRepo.create({
        argA,
        argB,
      });

      const job = await resultRepo.save(newJob);

      await broker.publish(
        "add-two-numbers",
        JSON.stringify({
          id: job.id,
        }),
      );

      return res.status(201).json({
        success: true,
        jobId: job.id,
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
      });
    }
  });

  app.get("/results/:resultId", async (req, res) => {
    try {
      const result = await resultRepo.findOneBy({
        id: parseInt(req.params.resultId, 10),
      });

      if (result) {
        res.status(200).json(result);
      } else {
        res.status(404).json({
          success: false,
          message: "Result not found",
        });
      }
    } catch (error) {
      console.error(error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
      });
    }
  });

  app.get("/results", async (_req, res) => {
    try {
      const results = await resultRepo.find();
      res.status(200).json(results);
    } catch (error) {
      console.error(error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
      });
    }
  });

  return app;
}
