/** Odoo ERP brand-style icon (Odoo purple #875A7B) */
interface OdooIconProps {
  className?: string;
}
export function OdooIcon({ className = 'w-4 h-4' }: OdooIconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="#875A7B"
      className={className}
      role="img"
      aria-label="Odoo"
    >
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 2c4.41 0 8 3.59 8 8s-3.59 8-8 8-8-3.59-8-8 3.59-8 8-8z" />
    </svg>
  );
}
