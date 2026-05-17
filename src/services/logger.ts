type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

const LEVEL_RANK: Record<LogLevel, number> = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 };

class Logger {
  private readonly minRank: number;

  constructor() {
    const raw = (process.env.LOG_LEVEL ?? 'INFO').toUpperCase() as LogLevel;
    this.minRank = LEVEL_RANK[raw] ?? LEVEL_RANK.INFO;
  }

  info(msg: string):  void { if (this.minRank <= LEVEL_RANK.INFO)  console.log(msg);   }
  warn(msg: string):  void { if (this.minRank <= LEVEL_RANK.WARN)  console.warn(msg);  }
  error(msg: string): void { if (this.minRank <= LEVEL_RANK.ERROR) console.error(msg); }
  debug(msg: string): void { if (this.minRank <= LEVEL_RANK.DEBUG) console.log(`[DEBUG] ${msg}`); }
}

export { Logger };
