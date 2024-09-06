import { RemoteProcess } from "@golem-sdk/golem-js";
import { createWriteStream, mkdirSync, existsSync } from "fs";
import { join } from "path";

type RemoteProcessStdIOChunk = string | ArrayBuffer | null | undefined;

const normalizeLines = (
  input: RemoteProcessStdIOChunk,
): string[] | undefined => {
  return input
    ?.toString()
    .split("\n")
    .filter((line) => !!line);
};

export const forwardToConsole = (proc: RemoteProcess, name: string) => {
  proc.stderr.subscribe((data: RemoteProcessStdIOChunk) =>
    normalizeLines(data)?.forEach((line) =>
      console.error("[%s] ERR: %s", name, line),
    ),
  );
  proc.stdout.subscribe((data: RemoteProcessStdIOChunk) =>
    normalizeLines(data)?.forEach((line) =>
      console.error("[%s] LOG: %s", name, line),
    ),
  );
};

export const forwardToFile = (
  proc: RemoteProcess,
  name: string,
  outputDir: string = "./logs",
) => {
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }
  // open files name.out.log and name.err.log, then produce lines into that file, close the file on error or complete
  const outPath = join(outputDir, `${name}.out.log`);
  const errPath = join(outputDir, `${name}.err.log`);

  const outStream = createWriteStream(outPath);
  const errStream = createWriteStream(errPath);

  const closeFiles = () => {
    errStream.close();
    outStream.close();
  };

  proc.stderr.subscribe({
    next: (data: RemoteProcessStdIOChunk) => errStream.write(data),
    complete: closeFiles,
    error: closeFiles,
  });

  proc.stdout.subscribe({
    next: (data: RemoteProcessStdIOChunk) => outStream.write(data),
    complete: closeFiles,
    error: closeFiles,
  });
};

/**
 * Convert a key-value map of environment settings to a string that can be injected to the shell command execution
 *
 * @param envDict Key-value dictionary of environment variables and their values
 */
export const toEnvString = (envDict: Record<string, string>) => {
  return Object.entries(envDict)
    .map(([key, value]) => `${key}=${value}`)
    .join(" ");
};
