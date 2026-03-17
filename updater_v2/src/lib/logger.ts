function ts() {
  return new Date().toISOString();
}

export const logger = {
  info:  (...args: unknown[]) => console.log(ts(), '[updater]', ...args),
  warn:  (...args: unknown[]) => console.warn(ts(), '[updater]', '[WARN]', ...args),
  error: (...args: unknown[]) => console.error(ts(), '[updater]', '[ERROR]', ...args),
};
