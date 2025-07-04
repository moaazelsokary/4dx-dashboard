import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Format number with comma separation, 2 decimal places only if needed, and millions format
export function formatNumber(value: number): string {
  if (value === 0) return "0";
  
  // Handle millions (1,000,000 and above)
  if (value >= 1000000) {
    const millions = value / 1000000;
    if (Number.isInteger(millions)) {
      return `${millions}M`;
    }
    return `${millions.toFixed(2).replace(/\.?0+$/, '')}M`;
  }
  
  // Handle thousands (250,000 and above, but less than 1,000,000)
  if (value >= 250000) {
    const thousands = value / 1000;
    if (Number.isInteger(thousands)) {
      return `${thousands}K`;
    }
    return `${thousands.toFixed(2).replace(/\.?0+$/, '')}K`;
  }
  
  // For values less than 250,000, show as normal number with commas
  if (Number.isInteger(value)) {
    return value.toLocaleString();
  }
  
  // For decimal numbers, show 2 decimal places
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  });
}

// Calculate status based on achievement rate
export function getStatusBadge(achievementRate: number, isNotYet: boolean = false) {
  if (isNotYet) {
    return { text: "Not in this period", variant: "secondary" as const };
  }
  
  const isPerfect = achievementRate === 100;
  const isOverTarget = achievementRate > 100;
  const isOnTrack = achievementRate >= 75 && achievementRate < 100;
  const isOffTrack = achievementRate >= 50 && achievementRate < 75;
  const isAtRisk = achievementRate < 50;
  
  if (isPerfect) {
    return { text: "Perfect", variant: "default" as const };
  } else if (isOverTarget) {
    return { text: "Over Target", variant: "default" as const, className: "bg-green-500 text-white" };
  } else if (isOnTrack) {
    return { text: "On Track", variant: "secondary" as const };
  } else if (isOffTrack) {
    return { text: "Off Track", variant: "secondary" as const };
  } else {
    return { text: "At Risk", variant: "destructive" as const };
  }
}
