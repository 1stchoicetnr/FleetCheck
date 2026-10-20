import { OutlineShape, outlineShapes, SilhouetteKind, GuideStyle } from "@/lib/photo-guides";

const CORNER_MARKS = [
  "M14 26 V14 H26",
  "M74 14 H86 V26",
  "M86 44 V56 H74",
  "M14 56 H26 V44",
];

function Shape({ shape }: { shape: OutlineShape }) {
  const dark = {
    fill: "none",
    stroke: "rgba(0,0,0,0.4)",
    strokeWidth: 1.75,
    strokeLinejoin: "round" as const,
    strokeLinecap: "round" as const,
    vectorEffect: "non-scaling-stroke" as const,
  };
  const light = {
    ...dark,
    stroke: "rgba(255,255,255,0.72)",
    strokeWidth: 1.05,
  };
  if (shape.cx != null && shape.cy != null && shape.r != null) {
    return (
      <g>
        <circle {...dark} cx={shape.cx} cy={shape.cy} r={shape.r} />
        <circle {...light} cx={shape.cx} cy={shape.cy} r={shape.r} />
      </g>
    );
  }
  return (
    <g>
      <path {...dark} d={shape.d} />
      <path {...light} d={shape.d} />
    </g>
  );
}

export function FramingOutline({
  style,
  kind,
}: {
  style: GuideStyle;
  kind: SilhouetteKind;
}) {
  const marks = style === "corners" ? CORNER_MARKS : null;
  const shapes = style === "silhouette" ? outlineShapes(kind) : [];
  return (
    <svg
      viewBox="0 0 100 70"
      className="absolute inset-0 h-full w-full pointer-events-none"
      aria-hidden="true"
    >
      {marks?.map((d) => (
        <g key={d}>
          <path
            d={d}
            fill="none"
            stroke="rgba(0,0,0,0.5)"
            strokeWidth="2.25"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
          <path
            d={d}
            fill="none"
            stroke="rgba(255,255,255,0.92)"
            strokeWidth="1.25"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        </g>
      ))}
      {shapes.map((shape, index) => (
        <Shape key={index} shape={shape} />
      ))}
    </svg>
  );
}
