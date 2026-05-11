export type PhaseRailStatus = "pending" | "active" | "done";

export interface PhaseRailItem {
  id: string;
  label: string;
  status: PhaseRailStatus;
}

export interface PhaseRailProps {
  items: PhaseRailItem[];
}

export function PhaseRail({ items }: PhaseRailProps) {
  return (
    <nav className="phase-rail" aria-label="phase-progress">
      {items.map((item) => (
        <div
          key={item.id}
          className={`phase-pill ${item.status === "active" ? "active" : ""} ${
            item.status === "done" ? "done" : ""
          }`}
        >
          <span className="dot" aria-hidden />
          <span>{item.label}</span>
        </div>
      ))}
    </nav>
  );
}
