export function PrivatePanel({ role }: { role?: string }) {
  return (
    <aside>
      <h2>Your Role</h2>
      <p>{role ?? "Hidden until game starts"}</p>
    </aside>
  );
}
