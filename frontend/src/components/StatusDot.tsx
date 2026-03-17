import type { UserStatus } from "../types";

type Props = {
  status: UserStatus;
  sizeClassName?: string;
  cutoutClassName?: string;
};

const colorByStatus: Record<UserStatus, string> = {
  ONLINE: "bg-[#23a55a]",
  IDLE: "bg-[#f0b232]",
  DND: "bg-[#f23f43]",
  INVISIBLE: "bg-[#80848e]",
  OFFLINE: "bg-[#80848e]"
};

const StatusDot = ({ status, sizeClassName = "h-2.5 w-2.5", cutoutClassName = "" }: Props): JSX.Element => {
  return <span className={`inline-block rounded-full ${sizeClassName} ${cutoutClassName} ${colorByStatus[status]}`} title={status} />;
};

export default StatusDot;
