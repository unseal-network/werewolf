export function WaitingRoom({
  players,
}: {
  players: Array<{ id: string; displayName: string }>;
}) {
  return (
    <section>
      <h2>Waiting Room</h2>
      <ul>
        {players.map((player) => (
          <li key={player.id}>{player.displayName}</li>
        ))}
      </ul>
    </section>
  );
}
