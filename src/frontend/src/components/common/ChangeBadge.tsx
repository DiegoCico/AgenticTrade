import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { formatPercent } from "../../utils/formatters";

type ChangeBadgeProps = {
  value: number;
};

export function ChangeBadge({ value }: ChangeBadgeProps) {
  const Icon = value >= 0 ? ArrowUpRight : ArrowDownRight;

  return (
    <span className={value >= 0 ? "change positive" : "change negative"}>
      <Icon size={16} strokeWidth={2.4} />
      {formatPercent(value)}
    </span>
  );
}
