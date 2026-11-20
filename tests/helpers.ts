import { mapList } from "../src/mapper";
import type { NormList, NormTask } from "../src/model";
import { sampleAccount } from "./fixtures";

export function sampleLists(): NormList[] {
  const { lists, tasks } = sampleAccount();
  return lists.map((l) => mapList(l, tasks[l.id] ?? []));
}
export const allTasks = (lists: NormList[]): NormTask[] => lists.flatMap((l) => l.tasks);
