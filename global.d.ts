// Ambient interfaces shared across the codebase via JSDoc @type annotations.
/** @typedef {import('./campaignDb').CampaignDatabase} CampaignDatabase */
// This file intentionally has no top-level export {} so its interfaces are global.

interface LeadRecord {
  email: string;
  businessName?: string;
  status?: string;
  sentAt?: number | null;
  followedUp1At?: number | null;
  followedUp2At?: number | null;
  followedUp3At?: number | null;
  followedUpAt?: number | null;
  repliedAt?: number | null;
  bouncedAt?: number | null;
  unsubscribedAt?: number | null;
  completedAt?: number | null;
  accountId?: string | number | null;
  messageId?: string | null;
  platform?: string;
  website?: string;
  city?: string;
  state?: string;
  openedAt?: number | null;
  openCount?: number;
  clickedAt?: number | null;
  clickCount?: number;
  score?: number;
  customSentence?: string;
  sentiment?: string;
  intent?: string;
  softBounceCount?: number;
  failReason?: string;
  emails?: string[];
  name?: string;
  nextStage?: number;
  [key: string]: unknown;
}

interface EmailAccount {
  id?: string | number;
  user?: string;
  email?: string;
  pass?: string;
  password?: string;
  host?: string;
  smtpHost?: string;
  port?: string | number;
  smtpPort?: string | number;
  appPassword?: string;
  adminPassword?: string;
  adminSecret?: string;
  totpSecret?: string;
  imapHost?: string;
  imapPort?: string | number;
  [key: string]: unknown;
}

interface CampaignSettings {
  senderDisplayName?: string;
  physicalAddress?: string;
  accounts?: EmailAccount[];
  delayMinMs?: number;
  delayMaxMs?: number;
  maxEmailsPerDay?: number;
  startHour?: number;
  endHour?: number;
  bounceThreshold?: number;
  maxDailyTotal?: number;
  webhookUrl?: string;
  [key: string]: unknown;
}

interface CampaignData {
  records: { [email: string]: LeadRecord };
  dailyCounts: { [accountId: string]: { [date: string]: number } };
  unsubscribed: string[];
  activityLog: object[];
  abTests: { [id: string]: AbTestResult };
  warmup: { [accountId: string]: object };
  alerts: object[];
  accountState: { [accountId: string]: object };
}

interface TemplateData {
  firstName?: string;
  'First Name'?: string;
  contactName?: string;
  email?: string;
  companyName?: string;
  Company?: string;
  businessName?: string;
  portfolio?: string;
  Portfolio?: string;
  city?: string;
  state?: string;
  website?: string;
  customSentence?: string;
  [key: string]: unknown;
}


interface AbTestResult {
  variants: { [variant: string]: { sent: number; replies: number; opens?: number; clicks?: number } };
  promotedWinner?: string;
  promotedAt?: number;
  zScore?: number;
  pValue?: number;
  [key: string]: unknown;
}

interface InboxRow {
  direction?: string;
  accountId?: string | number;
  leadEmail?: string;
  fromAddress?: string;
  subject?: string;
  textBody?: string;
  htmlBody?: string;
  at?: number;
  messageId?: string;
  [key: string]: unknown;
}


interface AbAlert {
  id: string;
  type: string;
  severity: string;
  accountId: string | number;
  message: string;
  at: number;
  [key: string]: unknown;
}

interface AbTestRecord {
  id?: string;
  campaignId?: string;
  variant?: string;
  subject?: string;
  text?: string;
  sentCount?: number;
  openCount?: number;
  replyCount?: number;
  score?: number;
  data?: Record<string, unknown>;
  [key: string]: unknown;
}

declare module 'date-holidays' {
  interface HolidayItem {
    type: string;
    name: string;
    date?: Date;
  }
  interface Holidays {
    isHoliday(date: Date): false | HolidayItem[];
    setHolidays(country: string, state?: string): void;
    getHolidays(year?: number): unknown[];
  }
  const Holidays: {
    new (country?: string, state?: string): Holidays;
  };
  export = Holidays;
}

declare module 'proper-lockfile' {
  interface LockOptions {
    stale?: number;
    update?: number;
    retries?: number;
    onCompromised?: (err: Error) => void;
    realpath?: boolean;
    fs?: unknown;
    lockfilePath?: (file: string) => string;
  }
  interface LockHandle {
    (): Promise<void>;
  }
  const properLockfile: {
    lock(file: string, options?: LockOptions): Promise<LockHandle>;
    lockSync(file: string, options?: LockOptions): LockHandle;
    check(file: string, options?: LockOptions): Promise<boolean>;
    unlock(file: string, options?: LockOptions): Promise<void>;
  };
  export = properLockfile;
}

declare module 'nodemailer' {
  namespace nodemailer {
    function createTransport(options: unknown): nodemailer.TransportInstance;
    function getTestMessageUrl(info: { messageId?: string; accepted?: unknown[] }): string | null;
    function createTestAccount(): Promise<{
      user: string;
      pass: string;
      smtp: { host: string; port: number; secure: boolean };
      imap: { host: string; port: number; tls: boolean };
    }>;
    interface TransportInstance {
      sendMail(options: unknown): Promise<{ messageId: string; accepted?: unknown[]; rejected?: unknown[] }>;
      verify(): Promise<boolean>;
      close(): void;
    }
  }
  export = nodemailer;
}

declare module 'mailparser' {
  interface SimpleParsedFrom {
    value?: Array<{ address?: string; name?: string }>;
    text?: string;
  }
  interface SimpleParsedMessage {
    subject?: string;
    from?: SimpleParsedFrom;
    to?: SimpleParsedFrom;
    date?: Date;
    messageId?: string;
    inReplyTo?: string;
    references?: unknown;
    text?: string;
    html?: string;
    attachments?: unknown[];
    [key: string]: unknown;
  }
  const mailparser: {
    simpleParser(input: string | Buffer, options?: unknown): Promise<SimpleParsedMessage>;
  };
  export = mailparser;
}

declare module 'p-limit' {
  interface PLimit {
    (fn: () => Promise<unknown>): Promise<unknown>;
    activeCount: number;
    pendingCount: number;
    clearQueue(): void;
  }
  function pLimit(concurrency: number): PLimit;
  export = pLimit;
}

declare module 'xlsx' {
  const XLSX: {
    utils: {
      json_to_sheet(data: unknown[], options?: unknown): unknown;
      book_new(): unknown;
      book_append_sheet(book: unknown, sheet: unknown, name: string): void;
    };
    writeFile(book: unknown, filename: string, options?: unknown): void;
    readFile(filename: string): unknown;
  };
  export = XLSX;
}

declare module 'axios' {
  interface AxiosResponse {
    data: unknown;
    status: number;
    statusText: string;
    headers: unknown;
    request?: unknown;
  }
  interface AxiosInstance {
    get(url: string, config?: unknown): Promise<AxiosResponse>;
    post(url: string, data?: unknown, config?: unknown): Promise<AxiosResponse>;
  }
  const axios: AxiosInstance & {
    create(config?: unknown): AxiosInstance;
    defaults: unknown;
  };
  export = axios;
}

declare module 'cheerio' {
  interface CheerioElement {
    text(): unknown;
    attr(name: string): string | undefined;
    find(selector: string): CheerioElement;
    first(): CheerioElement;
    html(): string | null;
    length: number;
  }
  interface CheerioAPI extends CheerioElement {
    (selector: string): CheerioElement;
  }
  function cheerio(html: string, options?: unknown): CheerioAPI;
  namespace cheerio {
    function load(html: string, options?: unknown): CheerioAPI;
  }
  export = cheerio;
}

declare module 'node-cache' {
  class NodeCache {
    constructor(options?: { stdTTL?: number; checkperiod?: number });
    get(key: string): unknown | undefined;
    set(key: string, value: unknown, ttl?: number): boolean;
    del(key: string): number;
    flushAll(): void;
  }
  export = NodeCache;
}

declare module 'imapflow' {
  interface ImapFlowOptions {
    host: string;
    port: number;
    secure?: boolean;
    auth?: { user: string; pass?: string; accessToken?: string };
    tls?: unknown;
    logRaw?: boolean;
    logger?: unknown;
    maxIdleTime?: number;
  }
  interface MailboxLock {
    done(): Promise<void>;
    release(): Promise<void>;
  }
  interface ImapFlow {
    connect(): Promise<void>;
    mailboxOpen(path: string, options?: unknown): Promise<unknown>;
    getMailboxLock(path: string): Promise<MailboxLock>;
    search(criteria: Record<string, unknown>): Promise<Buffer[]>;
    fetch(query: unknown, options?: unknown): AsyncIterable<unknown>;
    messageFlagsAdd(messages: unknown, flags: unknown): Promise<unknown>;
    logout(): Promise<void>;
    on(event: string, handler: (...args: unknown[]) => void): ImapFlow;
    [key: string]: unknown;
  }
  const imapflow: {
    new (options: ImapFlowOptions): ImapFlow;
    prototype: ImapFlow;
  };
  const ImapFlow: typeof imapflow;
  export { imapflow, ImapFlow };
}

declare module 'dotenv' {
  const dotenv: {
    config(options?: unknown): { parsed?: Record<string, string>; error?: Error };
  };
  export = dotenv;
}

declare module 'node-cron' {
  interface TaskOptions {
    scheduled?: boolean;
    timezone?: string;
  }
  interface Task {
    stop(): void;
    start(): void;
    getStatus(): 'running' | 'stopped';
    lastDate(): Date | null;
    nextDates(count?: number): Date[];
  }
  const nodeCron: {
    schedule(cronExpression: string, func: () => void | Promise<void>, options?: TaskOptions | boolean): Task;
    validate(cronExpression: string): boolean;
  };
  export = nodeCron;
}
