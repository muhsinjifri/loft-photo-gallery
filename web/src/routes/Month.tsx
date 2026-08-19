import { useParams } from "react-router-dom";
import { GalleryView } from "./GalleryView";
import { ScopeToggle } from "../components/ScopeToggle";
import { useScope } from "../scope";

function formatMonth(ym: string) {
  const [y, m] = ym.split("-");
  const names = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];
  const i = parseInt(m, 10) - 1;
  if (Number.isNaN(i) || i < 0 || i > 11) return ym;
  return `${names[i]} ${y}`;
}

export function Month() {
  const { ym } = useParams();
  const { scope } = useScope();
  return (
    <GalleryView
      filter={{ year_month: ym ?? null, scope }}
      title={ym ? formatMonth(ym) : ""}
      subtitle="a month, as it was"
      emptyKind="month"
      emptyTitle="quiet month"
      emptySub="nothing was kept from this stretch."
      rightSlot={<ScopeToggle />}
    />
  );
}
