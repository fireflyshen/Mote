export function PixelLoader({
  label = "正在加载…",
  inline = false,
}: {
  label?: string;
  inline?: boolean;
}) {
  return (
    <div
      className="pixel-loader"
      data-inline={inline || undefined}
      role="status"
      aria-live="polite"
    >
      <div className="pixel-loader-grid" aria-hidden="true">
        {[0, 1, 3, 2].map((step, index) => (
          <i key={index} style={{ animationDelay: `${step * 0.15}s` }} />
        ))}
      </div>
      <span>{label}</span>
    </div>
  );
}
