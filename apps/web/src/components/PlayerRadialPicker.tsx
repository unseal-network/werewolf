import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import {
  PLAYER_PICKER_INNER_HIT_RATIO,
  PLAYER_PICKER_LONG_PRESS_MS,
  PLAYER_PICKER_OUTER_HIT_RATIO,
  getRadialAvatarSize,
  getRadialItemStyle,
  getRadialSelectionState,
  getRadialSliceStyle,
} from "./actionControlLogic";
import { normalizeDisplayRole, ROLE_COLOR, ROLE_IMG } from "../constants/roles";
import { avatarPalette } from "./SeatAvatar";
import { StageActionButton } from "./StageActionButton";

export interface PlayerRadialTarget {
  seatNo: number;
  playerId: string;
  displayName: string;
  userId?: string | undefined;
  agentId?: string | undefined;
  avatarUrl?: string | undefined;
  visibleRole?: string | undefined;
}

export interface PlayerRadialPickerProps {
  targets: PlayerRadialTarget[];
  selectedTargetId: string | null;
  confirmLabel: string;
  skipLabel?: string;
  showActionButton?: boolean;
  actionLoading?: boolean;
  defaultOpen?: boolean;
  onSelect: (playerId: string) => void;
  onClear: () => void;
  onConfirm: () => void;
  onSkip?: () => void;
}

function initialForName(name: string) {
  return name.trim().charAt(0).toUpperCase() || "?";
}

function renderTargetAvatar(target: PlayerRadialTarget) {
  const roleId = target.visibleRole ? normalizeDisplayRole(target.visibleRole) : undefined;
  const roleImg = roleId ? ROLE_IMG[roleId] : undefined;
  const imageSrc = roleImg ?? target.avatarUrl;
  return (
    <>
      {imageSrc ? (
        <img
          className={`player-picker-avatar-img ${roleImg ? "role-avatar-img" : "player-avatar-img"}`}
          src={imageSrc}
          alt=""
          draggable={false}
        />
      ) : (
        <span className="player-picker-initial">{initialForName(target.displayName)}</span>
      )}
      <strong className="player-picker-seat-ribbon">{target.seatNo}</strong>
    </>
  );
}

function getTargetAvatarStyle(target: PlayerRadialTarget): CSSProperties {
  const roleId = target.visibleRole ? normalizeDisplayRole(target.visibleRole) : undefined;
  const roleColor = roleId ? ROLE_COLOR[roleId] : undefined;
  const palette = avatarPalette(target.userId ?? target.agentId ?? target.playerId ?? target.displayName ?? String(target.seatNo));
  return {
    "--player-picker-avatar-bg": palette.bg,
    "--player-picker-avatar-fg": palette.fg,
    ...(roleColor ? { "--player-picker-role-color": roleColor } : {}),
  } as CSSProperties;
}

function getTargetAvatarClass(target: PlayerRadialTarget) {
  const hasRoleAvatar = Boolean(target.visibleRole);
  const hasImageAvatar = Boolean(!hasRoleAvatar && target.avatarUrl);
  return hasRoleAvatar
    ? "has-role-avatar"
    : hasImageAvatar
      ? "has-image-avatar"
      : "has-letter-avatar";
}

function isInsideOpenWheel(event: globalThis.PointerEvent, wheel: HTMLDivElement) {
  const target = event.target instanceof Element ? event.target : null;
  if (target?.closest(".player-picker-avatar, .player-picker-slice")) return true;

  const rect = wheel.getBoundingClientRect();
  const radius = Math.min(rect.width, rect.height) / 2;
  const dx = event.clientX - (rect.left + rect.width / 2);
  const dy = event.clientY - (rect.top + rect.height / 2);
  return Math.hypot(dx, dy) <= radius * PLAYER_PICKER_OUTER_HIT_RATIO;
}

export function PlayerRadialPicker({
  targets,
  selectedTargetId,
  confirmLabel,
  skipLabel,
  showActionButton = true,
  actionLoading,
  defaultOpen = false,
  onSelect,
  onClear,
  onConfirm,
  onSkip,
}: PlayerRadialPickerProps) {
  const wheelRef = useRef<HTMLDivElement | null>(null);
  const isPressDraggingRef = useRef(false);
  const suppressClickRef = useRef(false);
  const longPressTimerRef = useRef<number | null>(null);
  const hoverFrameRef = useRef<number | null>(null);
  const pendingHoverPointRef = useRef<{ x: number; y: number; allowOutsideWheel: boolean } | null>(null);
  const pressStartRef = useRef<{ pointerId: number; x: number; y: number } | null>(null);
  const wheelGeometryRef = useRef<{ centerX: number; centerY: number; radius: number } | null>(null);
  const [wheelOpen, setWheelOpen] = useState(defaultOpen);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [selectionPulseId, setSelectionPulseId] = useState<string | null>(null);
  const hoveredIdRef = useRef<string | null>(null);
  const selectedTarget = useMemo(
    () => targets.find((target) => target.playerId === selectedTargetId),
    [selectedTargetId, targets]
  );
  const pickerStyle = {
    "--player-picker-slice-size": `${getRadialAvatarSize(targets.length)}px`,
    "--player-picker-slice-deg": `${targets.length > 0 ? 360 / targets.length : 360}deg`,
  } as CSSProperties;

  const hoveredTarget = targets.find((target) => target.playerId === hoveredId);
  const activeTarget = wheelOpen ? hoveredTarget : selectedTarget;

  useEffect(() => {
    return () => {
      if (longPressTimerRef.current !== null) {
        window.clearTimeout(longPressTimerRef.current);
      }
      if (hoverFrameRef.current !== null) {
        window.cancelAnimationFrame(hoverFrameRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!selectedTargetId) return undefined;
    setSelectionPulseId(selectedTargetId);
    const timer = window.setTimeout(() => {
      setSelectionPulseId((current) =>
        current === selectedTargetId ? null : current
      );
    }, 240);
    return () => window.clearTimeout(timer);
  }, [selectedTargetId]);

  useEffect(() => {
    if (!wheelOpen) return;
    const closeOnOutsidePointer = (event: globalThis.PointerEvent) => {
      const wheel = wheelRef.current;
      if (wheel && isInsideOpenWheel(event, wheel)) return;
      clearLongPressTimer();
      isPressDraggingRef.current = false;
      suppressClickRef.current = false;
      pressStartRef.current = null;
      setHoveredIdIfChanged(null);
      wheelGeometryRef.current = null;
      setWheelOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePointer);
  }, [wheelOpen]);

  function clearLongPressTimer() {
    if (longPressTimerRef.current === null) return;
    window.clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = null;
  }

  function measureWheelGeometry() {
    const rect = wheelRef.current?.getBoundingClientRect();
    if (!rect) return null;
    const geometry = {
      centerX: rect.left + rect.width / 2,
      centerY: rect.top + rect.height / 2,
      radius: Math.min(rect.width, rect.height) / 2,
    };
    wheelGeometryRef.current = geometry;
    return geometry;
  }

  function getHoverTargetIdFromPoint(
    point: { x: number; y: number },
    allowOutsideWheel = false
  ) {
    const geometry = wheelGeometryRef.current ?? measureWheelGeometry();
    if (!geometry) return null;
    const { index } = getRadialSelectionState({
      point,
      center: { x: geometry.centerX, y: geometry.centerY },
      count: targets.length,
      minRadius: geometry.radius * PLAYER_PICKER_INNER_HIT_RATIO,
      maxRadius: allowOutsideWheel
        ? Number.POSITIVE_INFINITY
        : geometry.radius * PLAYER_PICKER_OUTER_HIT_RATIO,
    });
    return targets[index]?.playerId ?? null;
  }

  function applyHoveredElement(nextId: string | null) {
    const wheel = wheelRef.current;
    if (!wheel) return;
    wheel
      .querySelectorAll<HTMLElement>("[data-player-picker-hovered='true']")
      .forEach((element) => {
        element.removeAttribute("data-player-picker-hovered");
      });
    if (!nextId) return;
    wheel.querySelectorAll<HTMLElement>("[data-player-picker-target]").forEach((element) => {
      if (element.dataset.playerPickerTarget !== nextId) return;
      element.dataset.playerPickerHovered = "true";
    });
  }

  function setHoveredIdIfChanged(nextId: string | null, shouldRender = true) {
    if (hoveredIdRef.current === nextId) return;
    hoveredIdRef.current = nextId;
    applyHoveredElement(nextId);
    if (shouldRender) {
      setHoveredId(nextId);
    }
  }

  function scheduleHoverUpdate(
    point: { x: number; y: number },
    allowOutsideWheel = false
  ) {
    pendingHoverPointRef.current = { ...point, allowOutsideWheel };
    if (hoverFrameRef.current !== null) return;
    hoverFrameRef.current = window.requestAnimationFrame(() => {
      hoverFrameRef.current = null;
      const pending = pendingHoverPointRef.current;
      pendingHoverPointRef.current = null;
      if (!pending) return;
      setHoveredIdIfChanged(
        getHoverTargetIdFromPoint(pending, pending.allowOutsideWheel),
        false
      );
    });
  }

  function updateHover(event: PointerEvent<HTMLElement>) {
    scheduleHoverUpdate({ x: event.clientX, y: event.clientY }, true);
  }

  function clearSelectionAndClose() {
    onClear();
    setWheelOpen(false);
    setHoveredIdIfChanged(null);
    wheelGeometryRef.current = null;
  }

  function commitHover() {
    const targetId = hoveredIdRef.current;
    if (targetId) {
      onSelect(targetId);
      setWheelOpen(false);
      setHoveredIdIfChanged(null);
      wheelGeometryRef.current = null;
    }
  }

  function moveHover(step: number) {
    if (targets.length === 0) return;
    const currentHoveredId = hoveredIdRef.current;
    const currentIndex = currentHoveredId
      ? targets.findIndex((target) => target.playerId === currentHoveredId)
      : selectedTarget
        ? targets.findIndex(
            (target) => target.playerId === selectedTarget.playerId
          )
        : 0;
    const startIndex = currentIndex >= 0 ? currentIndex : 0;
    const nextIndex = (startIndex + step + targets.length) % targets.length;
    setHoveredIdIfChanged(targets[nextIndex]?.playerId ?? null);
  }

  function handleWheelKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (targets.length === 0) return;
    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
        event.preventDefault();
        if (!wheelOpen) setWheelOpen(true);
        moveHover(1);
        break;
      case "ArrowLeft":
      case "ArrowUp":
        event.preventDefault();
        if (!wheelOpen) setWheelOpen(true);
        moveHover(-1);
        break;
      case "Enter":
      case " ":
        event.preventDefault();
        if (!wheelOpen) {
          setWheelOpen(true);
          return;
        }
        {
          const targetId = hoveredIdRef.current;
          if (!targetId) {
            if (selectedTarget) {
              onConfirm();
            }
            break;
          }
          onSelect(targetId);
          setWheelOpen(false);
          setHoveredIdIfChanged(null);
          wheelGeometryRef.current = null;
        }
        break;
      case "Escape":
        event.preventDefault();
        if (wheelOpen) {
          setWheelOpen(false);
          setHoveredIdIfChanged(null);
          wheelGeometryRef.current = null;
        } else if (selectedTarget) {
          clearSelectionAndClose();
        }
        break;
      default:
        break;
    }
  }

  function startPressDrag(event: PointerEvent<HTMLButtonElement>) {
    clearLongPressTimer();
    pressStartRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
    event.currentTarget.setPointerCapture(event.pointerId);
    wheelGeometryRef.current = measureWheelGeometry();
    if (wheelOpen) return;
    longPressTimerRef.current = window.setTimeout(() => {
      longPressTimerRef.current = null;
      isPressDraggingRef.current = true;
      suppressClickRef.current = true;
      setWheelOpen(true);
      setHoveredIdIfChanged(null);
      window.requestAnimationFrame(() => {
        wheelGeometryRef.current = measureWheelGeometry();
      });
    }, PLAYER_PICKER_LONG_PRESS_MS);
  }

  function updatePressDrag(event: PointerEvent<HTMLButtonElement>) {
    const pressStart = pressStartRef.current;
    if (wheelOpen && !isPressDraggingRef.current && pressStart?.pointerId === event.pointerId) {
      const moved = Math.hypot(event.clientX - pressStart.x, event.clientY - pressStart.y);
      if (moved > 6) {
        isPressDraggingRef.current = true;
        suppressClickRef.current = true;
      }
    }
    if (!isPressDraggingRef.current) return;
    event.stopPropagation();
    scheduleHoverUpdate({ x: event.clientX, y: event.clientY }, true);
  }

  function endPressDrag(event: PointerEvent<HTMLButtonElement>) {
    clearLongPressTimer();
    if (!isPressDraggingRef.current) {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      pressStartRef.current = null;
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    isPressDraggingRef.current = false;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    pressStartRef.current = null;
    const targetId = getHoverTargetIdFromPoint(
      { x: event.clientX, y: event.clientY },
      true
    );
    if (targetId) {
      onSelect(targetId);
      setWheelOpen(false);
      setHoveredIdIfChanged(null);
      wheelGeometryRef.current = null;
    } else if (selectedTarget) {
      clearSelectionAndClose();
    }
  }

  const wheel = (
    <div
      ref={wheelRef}
      className={`player-picker-wheel ${wheelOpen ? "open" : ""}`}
      data-radial-open={wheelOpen ? "true" : "false"}
      data-has-selection={selectedTarget ? "true" : "false"}
      tabIndex={0}
      onKeyDown={handleWheelKeyDown}
      onPointerMove={wheelOpen ? updateHover : undefined}
      onPointerUp={wheelOpen ? commitHover : undefined}
      onPointerLeave={() => {
        setHoveredIdIfChanged(null);
        wheelGeometryRef.current = null;
      }}
    >
      {wheelOpen ? (
        <div className="player-picker-slices" aria-hidden>
          {targets.map((target, index) => (
            <span
              key={target.playerId}
              className={`player-picker-sector ${target.playerId === hoveredId ? "hovered" : ""}`}
              data-player-picker-target={target.playerId}
              style={getRadialSliceStyle(index, targets.length)}
            />
          ))}
        </div>
      ) : null}
      {wheelOpen
        ? targets.map((target, index) => (
            <button
              key={target.playerId}
              type="button"
              className={`player-picker-slice ${target.playerId === hoveredId ? "hovered" : ""} ${
                target.playerId === selectionPulseId ? "selected-pulse" : ""
              } ${getTargetAvatarClass(target)}`}
              data-player-picker-target={target.playerId}
              style={{ ...getRadialItemStyle(index, targets.length), ...getTargetAvatarStyle(target) }}
              onClick={() => {
                onSelect(target.playerId);
                setWheelOpen(false);
                setHoveredIdIfChanged(null);
                wheelGeometryRef.current = null;
              }}
            >
              {renderTargetAvatar(target)}
            </button>
          ))
        : null}
      <button
        type="button"
        className={`player-picker-avatar ${wheelOpen ? "expanded" : ""} ${activeTarget ? "has-target" : ""} ${
          selectedTarget && !wheelOpen ? "selected-avatar" : ""
        } ${activeTarget?.playerId === selectionPulseId ? "selected-pulse" : ""} ${wheelOpen ? "is-open" : ""} ${
          activeTarget ? getTargetAvatarClass(activeTarget) : ""
        }`}
        style={activeTarget ? getTargetAvatarStyle(activeTarget) : undefined}
        onPointerDown={startPressDrag}
        onPointerMove={updatePressDrag}
        onPointerUp={endPressDrag}
        onPointerCancel={endPressDrag}
        onClick={() => {
          if (isPressDraggingRef.current || suppressClickRef.current) {
            suppressClickRef.current = false;
            return;
          }
          if (wheelOpen && selectedTarget && !hoveredIdRef.current) {
            clearSelectionAndClose();
            return;
          }
          setWheelOpen((open) => !open);
        }}
        aria-label={selectedTarget ? `重新选择 ${selectedTarget.displayName}` : "选择玩家"}
      >
        {wheelOpen && activeTarget ? (
          renderTargetAvatar(activeTarget)
        ) : activeTarget ? (
          renderTargetAvatar(activeTarget)
        ) : (
          "+"
        )}
      </button>
      {selectedTarget && !wheelOpen ? (
        <button
          type="button"
          className="player-picker-clear"
          onClick={(event) => {
            event.stopPropagation();
            clearSelectionAndClose();
          }}
          aria-label={`取消选择 ${selectedTarget.displayName}`}
        >
          ×
        </button>
      ) : null}
    </div>
  );

  if (selectedTarget) {
    return (
      <div className="player-picker selected" style={pickerStyle} data-count={targets.length}>
        <div className="player-picker-control-slot">
          {wheel}
        </div>
        {showActionButton && !wheelOpen ? <div className="player-picker-action-slot">
          <StageActionButton
            className="stage-confirm player-picker-action"
            label={confirmLabel}
            variant="primary"
            onClick={onConfirm}
            loading={Boolean(actionLoading)}
          />
        </div> : null}
      </div>
    );
  }

  return (
    <div className="player-picker" style={pickerStyle} data-count={targets.length}>
      <div className="player-picker-control-slot">
        {wheel}
      </div>
      {showActionButton && !wheelOpen && skipLabel && onSkip ? (
        <div className="player-picker-action-slot">
          <StageActionButton
            className="stage-skip player-picker-action"
            label={skipLabel}
            variant="secondary"
            onClick={onSkip}
            loading={Boolean(actionLoading)}
          />
        </div>
      ) : null}
    </div>
  );
}
