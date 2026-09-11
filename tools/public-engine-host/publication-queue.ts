export type PublicationFailure = (error: unknown) => void;

/** One bounded, coalescing asynchronous publication at a time. */
export function createPublicationQueue(
  publish: () => Promise<void>,
  onFailure: PublicationFailure,
) {
  let pending = false;
  let current: Promise<void> | undefined;
  const reportFailure = (error: unknown): void => {
    try { onFailure(error); } catch {}
  };

  async function drain(): Promise<void> {
    try {
      while (pending) {
        pending = false;
        try {
          await publish();
        } catch (error) {
          reportFailure(error);
        }
      }
    } finally {
      current = undefined;
    }
  }

  function request(): Promise<void> {
    pending = true;
    if (!current) current = Promise.resolve().then(drain);
    return current;
  }

  return { request };
}
