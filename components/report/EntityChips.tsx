import type { Entities } from "@/lib/types";

/**
 * Entities grouped by kind. The dot marker colour distinguishes the groups
 * visually, but each group also carries its own visible heading — colour never
 * carries the meaning alone.
 */
const GROUPS: { key: keyof Entities; label: string; dot: string }[] = [
  { key: "companies", label: "Companies", dot: "bg-console-accent" },
  { key: "people", label: "People", dot: "bg-sentiment-neutral" },
  { key: "places", label: "Places", dot: "bg-sentiment-positive" },
];

export function EntityChips({ entities }: { entities: Entities }) {
  const present = GROUPS.filter((g) => entities[g.key]?.length > 0);
  if (present.length === 0) return null;

  return (
    <section aria-labelledby="entities-heading">
      <h3 id="entities-heading" className="kicker mb-3">
        Entities
      </h3>
      <div className="space-y-4">
        {present.map((group) => (
          <div key={group.key}>
            <h4 className="mb-2 font-mono text-[10px] uppercase tracking-[0.14em] text-console-dim">
              {group.label}
              <span className="ml-2 text-console-faint">
                {entities[group.key].length}
              </span>
            </h4>
            <ul className="flex flex-wrap gap-2">
              {entities[group.key].map((name, i) => (
                <li
                  key={`${name}-${i}`}
                  className="inline-flex items-center gap-2 rounded-full border border-console-border bg-console-well px-3 py-1.5 font-mono text-xs text-console-ink transition-colors duration-200 hover:border-console-accent/40"
                >
                  <span
                    className={`h-1.5 w-1.5 shrink-0 rounded-full ${group.dot}`}
                    aria-hidden="true"
                  />
                  {name}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
