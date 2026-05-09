export function GameTable({
  phase,
  deadlineAt,
}: {
  phase: string;
  deadlineAt: string | null;
}) {
  return (
    <section>
      <h2>{phase}</h2>
      <p>{deadlineAt ? `Deadline: ${deadlineAt}` : "No active deadline"}</p>
    </section>
  );
}
