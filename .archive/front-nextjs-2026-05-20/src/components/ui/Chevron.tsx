import { SIZE } from "@/lib/ui/tokens";

export function Chevron({ direction }: { direction: "left" | "right" }) {
  const style =
    direction === "left"
      ? { display: "inline-block", verticalAlign: "middle", marginRight: 6 }
      : { display: "inline-block", verticalAlign: "middle", marginLeft: 6 };
  return (
    <svg
      width={SIZE.iconSm}
      height={SIZE.iconSm}
      viewBox="0 0 14 14"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={style}
      aria-hidden="true"
    >
      {direction === "left" ? (
        <polyline points="9,2 4,7 9,12" />
      ) : (
        <polyline points="5,2 10,7 5,12" />
      )}
    </svg>
  );
}
