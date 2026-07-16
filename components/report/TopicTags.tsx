/** Topic pills. Mono + a `#` prefix — these are tokens, not prose. */
export function TopicTags({ topics }: { topics: string[] }) {
  if (topics.length === 0) return null;

  return (
    <section aria-labelledby="topics-heading">
      <h3 id="topics-heading" className="kicker mb-3">
        Topics
      </h3>
      <ul className="flex flex-wrap gap-2">
        {topics.map((topic, i) => (
          <li
            key={`${topic}-${i}`}
            className="rounded border border-console-accent/25 bg-console-accent/[0.07] px-2.5 py-1 font-mono text-xs text-console-accent"
          >
            {/* Decorative, but still rendered text — it has to clear AA like any other. */}
            <span aria-hidden="true" className="text-console-accent/70">
              #
            </span>
            {topic}
          </li>
        ))}
      </ul>
    </section>
  );
}
