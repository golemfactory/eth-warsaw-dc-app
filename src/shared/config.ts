import { BrokerConfig } from "rascal";

export function makeRascalConfig(
  amqpUrl: string,
  connectionName: string,
): BrokerConfig {
  return {
    vhosts: {
      "/": {
        connection: {
          url: amqpUrl,
          socketOptions: {
            clientProperties: {
              connection_name: connectionName,
            },
          },
        },
        queues: ["compute-value-job"],
        publications: {
          "add-two-numbers": {
            queue: "compute-value-job",
          },
        },
        subscriptions: {
          "worker-add": {
            queue: "compute-value-job",
            prefetch: 1,
          },
        },
      },
    },
  };
}
