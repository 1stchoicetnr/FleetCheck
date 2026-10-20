import { FramingKind, outlineShapes } from "@/lib/photo-guides";

export function FramingOutline({ kind }: { kind: FramingKind }) {
  const shapes = outlineShapes(kind);
  return (
    <svg
      viewBox="0 0 100 70"
      className="absolute inset-0 h-full w-full pointer-events-none"
      aria-hidden="true"
    >
      {shapes.map((shape, index) => {
        const shared = {
          fill: "none",
          stroke: "rgba(0,0,0,0.55)",
          strokeWidth: 2.4,
          strokeLinejoin: "round" as const,
          strokeLinecap: "round" as const,
        };
        const light = { ...shared, stroke: "white", strokeWidth: 1.4 };
        if (shape.rect) {
          const { x, y, width, height, rx } = shape.rect;
          return (
            <g key={index}>
              <rect {...shared} x={x} y={y} width={width} height={height} rx={rx} />
              <rect {...light} x={x} y={y} width={width} height={height} rx={rx} />
            </g>
          );
        }
        if (shape.cx != null && shape.cy != null && shape.r != null) {
          return (
            <g key={index}>
              <circle {...shared} cx={shape.cx} cy={shape.cy} r={shape.r} />
              <circle {...light} cx={shape.cx} cy={shape.cy} r={shape.r} />
            </g>
          );
        }
        return (
          <g key={index}>
            <path {...shared} d={shape.d} />
            <path {...light} d={shape.d} />
          </g>
        );
      })}
    </svg>
  );
}
