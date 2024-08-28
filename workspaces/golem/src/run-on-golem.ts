import "dotenv/config";
import {
  GolemNetwork,
  MarketOrderSpec,
  sleep,
  waitFor,
} from "@golem-sdk/golem-js";
import { forwardToConsole, toEnvString } from "./utils/remote-process-helpers";
import { pinoPrettyLogger } from "@golem-sdk/pino-logger";

const PROVIDER_BLACKLIST: Array<{ id: string; name: string }> = [
  // {
  //   id: "0x4fd5cb1e282caec4185bc4b295cfccccf865b251",
  //   name: "testnet-c1-23",
  // },
  // {
  //   id: "0xcfd951a32a77e31e0c7ba85638c828a2ef4342cd",
  //   name: "jiuzhang.h",
  // },
  // {
  //   id: "0x2b3ec8f17dbaf01a728921638df90810024b6b46",
  //   name: "testnet-c1-20",
  // },
  // {
  //   id: "0x21060c1ed29d2e85ac02ba2e752bd34333ef4c45",
  //   name: "testnet-c1-12",
  // },
  // {
  //   id: "0x922f31d284dc937dbba0d430dc5eff0f2d50bccf",
  //   name: "testnet-c1-8",
  // },
];

const AVOIDED_PROVIDERS = PROVIDER_BLACKLIST.map((p) => p.id);

(async () => {
  const LOCAL_GVMI_PATH =
    "file:///home/ggodlewski/test-workshop/decentralized-computer/workspaces/application/ggodlewski-decentralized-computer-latest-45a87194d5.gvmi";

  const glm = new GolemNetwork({
    logger: pinoPrettyLogger({
      level: "info",
    }),
  });

  try {
    await glm.connect();

    const abortController = new AbortController();

    process.on("SIGINT", () => {
      console.log("SIGINT received, PID", process.pid);
      abortController.abort("SIGINT called");
    });

    const marketConfig: MarketOrderSpec["market"] = {
      // 15 minutes
      rentHours: 15 / 60,
      pricing: {
        model: "burn-rate",
        avgGlmPerHour: 3,
      },
      offerProposalFilter: (proposal) =>
        !AVOIDED_PROVIDERS.includes(proposal.provider.id),
    };

    const network = await glm.createNetwork({
      ip: "17.0.0.0/24",
    });

    console.log("Acquiring resources for DB");
    const srvDatabase = await glm.oneOf({
      order: {
        demand: {
          workload: {
            imageTag: "golem/postgres:16",
          },
        },
        market: marketConfig,
        network,
      },
      signalOrTimeout: abortController.signal,
    });

    console.log(
      "Starting database service on %s, %s, agreement ID",
      srvDatabase.agreement.provider.name,
      srvDatabase.agreement.provider.id,
      srvDatabase.agreement.id,
      srvDatabase.agreement,
    );

    const exeDatabase = await srvDatabase.getExeUnit(abortController.signal);
    const ipDatabase = exeDatabase.getIp();

    // Make stuff executable for non-root users... (gosu)
    // NOTE: Required when golem.runtime.version<0.4.1 #TODO: Feature flagging?
    console.log("Apply the workaround to make gosu work");
    console.log(await exeDatabase.run("chmod a+x -R /"));

    // Prevents: FATAL:  could not write lock file "/var/run/postgresql/.s.PGSQL.5432.lock": No space left on device
    console.log("Apply the workaround to have space for runtime data");
    console.log(
      await exeDatabase.run(
        "mount -t tmpfs -o size=500m none /var/run/postgresql",
      ),
    );

    // Workaround that prevents `ERR: initdb: error: could not open file "/dev/fd/63" for reading: No such file or directory`
    // resulting from usage of named pipes by postgres startup script
    console.log("Apply the workaround to enable named pipes usage");
    console.log(await exeDatabase.run("ln -s /proc/self/fd /dev/fd"));

    const databaseEnv = {
      POSTGRES_USER: "dbuser",
      POSTGRES_DB: "dbname",
      POSTGRES_PASSWORD: "dbpassword",
    };

    const dbEnvStr = toEnvString(databaseEnv);

    const procDatabase = await exeDatabase.runAndStream(
      "/usr/bin/bash",
      ["-c", `sleep 2; ${dbEnvStr} bash -x docker-entrypoint.sh postgres`], // CMD
      {
        env: databaseEnv,
        signalOrTimeout: abortController.signal,
      },
    );
    forwardToConsole(procDatabase, "database");

    console.log("Acquiring resources for Queue");
    const srvQueue = await glm.oneOf({
      order: {
        demand: {
          workload: {
            imageTag: "golem/rabbitmq:3-management",
          },
        },
        market: marketConfig,
        network,
      },
      signalOrTimeout: abortController.signal,
    });

    await sleep(10);
    const RABBITMQ_MANAGEMENT_PORT = 15672;
    const REST_API_PORT = 8080;

    console.log("Starting queue service...");
    const exeQueue = await srvQueue.getExeUnit(abortController.signal);
    const ipQueue = exeQueue.getIp();
    const procQueue = await exeQueue.runAndStream("rabbitmq-server", {
      signalOrTimeout: abortController.signal,
    });
    //forwardToConsole(procQueue, "queue");

    console.log("Exposing TCP Proxy to RabbitMQ management UI");
    const proxyQueue = exeQueue.createTcpProxy(RABBITMQ_MANAGEMENT_PORT);
    proxyQueue
      .listen(RABBITMQ_MANAGEMENT_PORT, abortController)
      .then(() =>
        console.log(
          `RabbitMQ management Started to listen on 'http://localhost:${RABBITMQ_MANAGEMENT_PORT}'`,
        ),
      )
      .catch((err) =>
        console.error(
          "Failed to start TcpProxy to forward traffic to RabbitMQ",
          err,
        ),
      );

    console.log("Acquiring resources for API");
    const srvApi = await glm.oneOf({
      order: {
        demand: {
          workload: {
            imageUrl: LOCAL_GVMI_PATH,
            minCpuCores: 2,
          },
        },
        market: marketConfig,
        network,
      },
      signalOrTimeout: abortController.signal,
    });

    console.log("Starting API service...");
    const exeApi = await srvApi.getExeUnit(abortController.signal);
    const apiEnv = {
      PORT: `${REST_API_PORT}`,
      AMQP_URL: `amqp://${ipQueue}`,
      POSTGRES_URL: `postgres://dbuser:dbpassword@${ipDatabase}/dbname`,
    };

    const procApi = await exeApi.runAndStream(
      toEnvString(apiEnv) + " npm run start:api",
      {
        env: apiEnv,
        signalOrTimeout: abortController.signal,
      },
    );
    forwardToConsole(procApi, "api");

    let isApiListening = false;
    procApi.stdout.subscribe((line) => {
      if (
        line
          ?.toString()
          .includes(`HTTP server started on port ${REST_API_PORT}`)
      ) {
        isApiListening = true;
      }
    });

    console.log("Waiting for REST API to become available");
    await waitFor(() => isApiListening, {
      abortSignal: abortController.signal,
    });

    const proxyApi = exeApi.createTcpProxy(REST_API_PORT);
    proxyApi
      .listen(REST_API_PORT, abortController)
      .then(() =>
        console.log("API Started to listen on 'http://localhost:8080'"),
      )
      .catch((err) =>
        console.error(
          "Failed to start TcpProxy to forward traffic to API",
          err,
        ),
      );

    console.log("Acquiring resources for WORKER");
    const srvWorker = await glm.oneOf({
      order: {
        demand: {
          workload: {
            imageUrl: LOCAL_GVMI_PATH,
            minCpuCores: 4,
          },
        },
        market: marketConfig,
        network,
      },
      signalOrTimeout: abortController.signal,
    });

    console.log("Starting WORKER service...");
    const exeWorker = await srvWorker.getExeUnit(abortController.signal);
    const workerEnv = {
      AMQP_URL: `amqp://${ipQueue}`,
      POSTGRES_URL: `postgres://dbuser:dbpassword@${ipDatabase}/dbname`,
    };
    const procWorker = await exeWorker.runAndStream(
      toEnvString(workerEnv) + " npm run start:worker",
      {
        env: workerEnv,
        signalOrTimeout: abortController.signal,
      },
    );
    forwardToConsole(procWorker, "worker");

    console.log("Started all services");

    await waitFor(
      () => procWorker.isFinished() || abortController.signal.aborted,
    );
    console.log("Worker process finished");

    await waitFor(() => procApi.isFinished() || abortController.signal.aborted);
    console.log("API process finished");

    await waitFor(
      () => procQueue.isFinished() || abortController.signal.aborted,
    );
    console.log("Queue process finished");

    await waitFor(() => procDatabase.isFinished());
    console.log("Database process finished");

    console.log("Finalizing rentals");

    await srvWorker.stopAndFinalize();

    await proxyApi.close();
    await srvApi.stopAndFinalize();

    await proxyQueue.close();
    await srvQueue.stopAndFinalize();

    await srvDatabase.stopAndFinalize();

    await glm.destroyNetwork(network);
  } catch (err) {
    console.error("Something went wrong:", err);
  } finally {
    await glm.disconnect();
    console.log("Clean done!");
  }
})().catch(console.error);
