import assert from "node:assert/strict";
import test from "node:test";
import { peopleForList } from "./people-list.ts";

test("inactive people stay hidden until the filter is on", () => {
  const people = [
    { id: "a", active: true },
    { id: "b", active: false },
  ];
  assert.deepEqual(
    peopleForList(people, false).map((person) => person.id),
    ["a"]
  );
  assert.deepEqual(
    peopleForList(people, true).map((person) => person.id),
    ["a", "b"]
  );
});
