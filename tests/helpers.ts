import { mapList } from "../src/mapper";
import type { NormList, NormTask } from "../src/model";
import { sampleAccount } from "./fixtures";

export function sampleLists(): NormList[] {
  const { lists, tasks } = sampleAccount();
  return lists.map((l) => mapList(l, tasks[l.id] ?? []));
}
export const allTasks = (lists: NormList[]): NormTask[] => lists.flatMap((l) => l.tasks);

export type Call = { url: string; method: string; body: Record<string, unknown> | undefined; auth: string | null; headers: Headers };

/** Scripted fetch: the handler gets each call and returns [status, json, headers?] (or throws to simulate a network error). */
export function scripted(handler: (c: Call, i: number) => [number, unknown, Record<string, string>?]) {
  const calls: Call[] = [];
  const fetchImpl = (async (url: string, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    const call: Call = { url, method: init?.method ?? "GET", body: init?.body ? JSON.parse(init.body as string) : undefined, auth: headers.get("Authorization"), headers };
    calls.push(call);
    const [status, json, h] = handler(call, calls.length - 1);
    return new Response(status === 204 ? null : JSON.stringify(json), { status, headers: h });
  }) as unknown as typeof fetch;
  return { calls, fetchImpl };
}
export const noSleep = async (_ms?: number): Promise<void> => undefined;
export const oneTask = (over: Partial<NormTask> = {}): NormTask => ({
  sourceId: "T", listId: "L", title: "Task", status: "notStarted", completed: false, importance: "normal", dueDateTime: null,
  reminderDateTime: null, isReminderOn: false, recurrence: null, body: "", bodyType: "text", steps: [], categories: [],
  createdDateTime: null, hasAttachments: false, linkedResourceCount: 0, linkedResourcesUnknown: false, ...over,
});
