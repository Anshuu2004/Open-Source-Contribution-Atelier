import { useCallback } from "react";
import { useSandboxCore } from "./useSandboxCore";

export interface PythonExecutionResult {
  output: string;
  error: string | null;
}

export function usePythonSandbox() {
  const createWorker = useCallback(
    () =>
      new Worker(new URL("../workers/pythonWorker.ts", import.meta.url), {
        type: "module",
      }),
    [],
  );

  const { executeCode, isExecuting, isReady } = useSandboxCore(createWorker);

  const runPythonCode = useCallback(
    (
      code: string,
      timeoutMs: number = 5000,
    ): Promise<PythonExecutionResult> => {
      return executeCode<PythonExecutionResult>(
        { pythonCode: code, timeoutMs },
        timeoutMs,
        (data) => {
          const d = data as { results?: string; error?: string | null };
          return { output: d.results || "", error: d.error || null };
        },
        {
          output: "",
          error:
            "Execution Timeout: The code took too long to run and was terminated.",
        },
      );
    },
    [executeCode],
  );

  return { runPythonCode, isExecuting, isReady };
}
