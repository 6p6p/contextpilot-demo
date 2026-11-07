// Never serialize raw error messages, stacks, causes, paths or arbitrary error codes.
export class ConfigurationError extends Error {
  constructor(message: string, readonly fields: string[]) { super(message); }
}

export type StartupStage = 'environment' | 'application' | 'plugins' | 'listen';
const codes = new Set(['EADDRINUSE', 'EACCES', 'ENOENT', 'EISDIR', 'EMFILE', 'ENFILE', 'FST_ERR_PLUGIN_TIMEOUT', 'AVV_ERR_READY_TIMEOUT', 'ERR_SERVER_ALREADY_LISTEN']);
export function startupDiagnostic(stage: StartupStage, error: unknown) {
  const configuration = error instanceof ConfigurationError;
  const rawCode = error instanceof Error && 'code' in error ? error.code : undefined;
  return {
    event: 'startup_failed', stage,
    errorType: configuration ? 'ConfigurationError' : error instanceof TypeError ? 'TypeError' : error instanceof RangeError ? 'RangeError' : error instanceof URIError ? 'URIError' : error instanceof Error ? 'Error' : 'UnknownError',
    code: configuration ? 'CONFIGURATION_INVALID' : typeof rawCode === 'string' && codes.has(rawCode) ? rawCode : 'STARTUP_EXCEPTION',
    fields: configuration ? error.fields : [],
  };
}
