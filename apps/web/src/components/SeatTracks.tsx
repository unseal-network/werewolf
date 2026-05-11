import { SeatAvatar, type SeatData } from "./SeatAvatar";

interface SeatTracksProps {
  seats: SeatData[];
  seatCount: number;
  sideLabel: "left" | "right";
  onSeatClick: (seatNo: number) => void;
}

function selectSide(
  seats: SeatData[],
  seatCount: number,
  sideLabel: "left" | "right"
): SeatData[] {
  const leftCount = Math.ceil(seatCount / 2);
  return seats
    .filter((seat) => seat.seatNo <= seatCount)
    .filter((seat) =>
      sideLabel === "left" ? seat.seatNo <= leftCount : seat.seatNo > leftCount
    );
}

function SeatTracks({ seats, seatCount, sideLabel, onSeatClick }: SeatTracksProps) {
  const items = selectSide(seats, seatCount, sideLabel);
  return (
    <div className={`seat-column ${sideLabel}`}>
      {items.map((seat) => (
        <SeatAvatar key={seat.seatNo} seat={seat} onClick={() => onSeatClick(seat.seatNo)} />
      ))}
    </div>
  );
}

interface SeatTracksLayoutProps {
  seats: SeatData[];
  seatCount: number;
  onSeatClick: (seatNo: number) => void;
}

export function SeatTracksLayout({ seats, seatCount, onSeatClick }: SeatTracksLayoutProps) {
  return (
    <div className="seat-layer">
      <SeatTracks seats={seats} seatCount={seatCount} sideLabel="left" onSeatClick={onSeatClick} />
      <SeatTracks seats={seats} seatCount={seatCount} sideLabel="right" onSeatClick={onSeatClick} />
    </div>
  );
}
