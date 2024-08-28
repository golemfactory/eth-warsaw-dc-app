// @ts-ignore
import { RemoteProcess } from "@golem-sdk/golem-js/dist/activity/exe-unit/process";

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
