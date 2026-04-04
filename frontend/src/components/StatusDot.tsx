import type { UserStatus } from "../types";

type Props = {
  status: UserStatus;
  sizeClassName?: string;
  cutoutClassName?: string;
  cutoutColor?: string;
  ringColor?: string;
  ringWidth?: number;
};

const colorByStatus: Record<UserStatus, string> = {
  ONLINE: "bg-[#23a55a]",
  IDLE: "bg-[#f0b232]",
  DND: "bg-[#f23f43]",
  INVISIBLE: "bg-[#80848e]",
  OFFLINE: "bg-[#80848e]"
};

const StatusDot = ({ status, sizeClassName = "h-2.5 w-2.5", cutoutClassName = "", cutoutColor, ringColor, ringWidth = 4 }: Props): JSX.Element => {
  const ringStyle = ringColor ? { boxShadow: `0 0 0 ${ringWidth}px ${ringColor}` } : undefined;
  const baseClasses = `relative inline-block rounded-full ${sizeClassName} ${cutoutClassName} ${colorByStatus[status]}`;

  if (status === "IDLE") {
    return (
      <span className={baseClasses} style={ringStyle}>
        <span className="absolute right-0 top-0 h-[58%] w-[58%] rounded-full" style={{ backgroundColor: cutoutColor ?? "#1e1f22" }} />
      </span>
    );
  }

  if (status === "DND") {
    return (
      <span className={baseClasses} style={ringStyle}>
        <span className="absolute left-1/2 top-1/2 h-[32%] w-[58%] -translate-x-1/2 -translate-y-1/2 rounded-full" style={{ backgroundColor: cutoutColor ?? "#1e1f22" }} />
      </span>
    );
  }

  if (status === "INVISIBLE" || status === "OFFLINE") {
    return (
      <span className={baseClasses} style={ringStyle}>
        <span className="absolute inset-[28%] rounded-full" style={{ backgroundColor: cutoutColor ?? "#1e1f22" }} />
      </span>
    );
  }

  return <span className={baseClasses} style={ringStyle} />;
};

export default StatusDot;
