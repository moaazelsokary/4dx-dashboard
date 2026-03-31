/** RASCI letter icon - larger text */
interface RASCIIconProps {
  className?: string;
}
export function RASCIIcon({ className = 'w-4 h-4' }: RASCIIconProps) {
  return (
    <svg
      viewBox="0 0 28 12"
      className={className}
      role="img"
      aria-label="RASCI"
    >
      <text
        x="50%"
        y="10"
        textAnchor="middle"
        fill="currentColor"
        style={{ fontFamily: 'system-ui, sans-serif', fontSize: 10, fontWeight: 'bold' }}
      >
        RASCI
      </text>
    </svg>
  );
}
