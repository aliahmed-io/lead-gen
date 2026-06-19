declare module 'proper-lockfile' {
  export interface LockOptions {
    stale?: number;
    update?: number;
    retries?: number | {
      retries?: number;
      factor?: number;
      minTimeout?: number;
      maxTimeout?: number;
      randomize?: boolean;
    };
    realpath?: boolean;
    fs?: unknown;
    onCompromised?: (err: Error) => void;
  }

  export function lock(file: string, options?: LockOptions): Promise<() => Promise<void>>;
  export function unlock(file: string, options?: LockOptions): Promise<void>;
  export function lockSync(file: string, options?: LockOptions): () => void;
  export function unlockSync(file: string, options?: LockOptions): void;
  export function check(file: string, options?: LockOptions): Promise<boolean>;
  export function checkSync(file: string, options?: LockOptions): boolean;

  const lockfile: {
    lock: typeof lock;
    unlock: typeof unlock;
    lockSync: typeof lockSync;
    unlockSync: typeof unlockSync;
    check: typeof check;
    checkSync: typeof checkSync;
  };
  export default lockfile;
}
