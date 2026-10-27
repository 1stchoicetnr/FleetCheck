/** Inactive people stay out of the list until someone asks to see them. */
export function peopleForList<T extends { active: boolean }>(
  people: T[],
  showInactive: boolean
): T[] {
  if (showInactive) return people;
  return people.filter((person) => person.active);
}
