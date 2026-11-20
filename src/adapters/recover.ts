import { AmbiguousWriteError } from "./http";

/**
 * Create once. If the create failed in transit, look the item up before creating it again,
 * so a request that actually succeeded is never duplicated.
 */
export async function createOnce(
  create: () => Promise<string>,
  find: () => Promise<string | undefined>,
  note: (message: string) => void,
  label: string,
): Promise<string> {
  try {
    return await create();
  } catch (e) {
    if (!(e instanceof AmbiguousWriteError)) throw e;
    const found = await find();
    if (found) {
      note(`"${label}": the create request failed in transit but the item exists, so it was reused.`);
      return found;
    }
    return create(); // not there: safe to create again. A second ambiguous failure propagates.
  }
}
