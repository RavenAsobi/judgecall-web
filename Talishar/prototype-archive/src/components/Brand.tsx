interface BrandProps {
  compact?: boolean;
}

export function Brand({ compact = false }: BrandProps) {
  return (
    <div className={`brand${compact ? " brand--compact" : ""}`} aria-label="Nimblism">
      <img className="brand__mark" src="/assets/nimblism-mark.png" alt="" />
      <span className="brand__name">Nimblism</span>
    </div>
  );
}
