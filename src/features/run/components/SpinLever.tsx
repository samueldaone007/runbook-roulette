import { useEffect, useRef, useState } from "react";

/**
 * The spin lever.
 *
 * Deliberately feels physical: the knob travels down the rail before the next
 * incident is drawn. The delay is short enough not to annoy and long enough to
 * register as cause and effect.
 */
export function SpinLever({
  onSpin,
  disabled,
  poolCount,
}: {
  onSpin: () => void;
  disabled?: boolean;
  poolCount: number;
}) {
  const [pulling, setPulling] = useState(false);
  const timer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  const pull = () => {
    if (pulling || disabled) return;
    setPulling(true);
    timer.current = window.setTimeout(() => {
      setPulling(false);
      onSpin();
    }, 620);
  };

  return (
    <button
      type="button"
      onClick={pull}
      disabled={disabled}
      className={`lever${pulling ? " is-pulling" : ""}`}
      aria-label="Pull the lever for a random incident"
    >
      <span className="lever-rail" aria-hidden="true" />
      <span className="lever-knob" aria-hidden="true" />
      <span>
        <span className="lever-title">Spin</span>
        <span className="lever-sub">Pull for an incident</span>
      </span>
      <span className="lever-count hidden sm:inline">
        {poolCount} in the drum
      </span>
    </button>
  );
}
