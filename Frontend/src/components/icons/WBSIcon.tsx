/** WBS - Work Breakdown Structure hierarchy icon */
interface WBSIconProps {
  className?: string;
}
export function WBSIcon({ className = 'w-4 h-4' }: WBSIconProps) {
  return (
    <img
      src="https://cdn-icons-png.flaticon.com/512/13969/13969731.png"
      alt="WBS"
      className={`${className} object-contain`}
      role="img"
    />
  );
}
