import { useParams } from "react-router";

import { Workbench } from "@/components/rt/Workbench";

export function meta() {
  return [{ title: "REDTHREAD · Investigation" }];
}

export default function InvestigationRoute() {
  const { id } = useParams();
  return <Workbench key={id} investigationId={id!} />;
}
