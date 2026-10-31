/** Display helpers shared by the run, debrief and progress screens. */

export function formatWhen(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "unknown";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

/** Normalise a command for "did the user run roughly this?" comparisons. */
export function normaliseCommand(command: string): string {
  return command
    .trim()
    .replace(/^sudo\s+/, "")
    .replace(/\s+/g, " ");
}
