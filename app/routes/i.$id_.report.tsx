import { useParams } from "react-router";

import { Report } from "@/components/rt/Report";

export function meta() {
  return [{ title: "REDTHREAD · Findings" }];
}

export default function ReportRoute() {
  const { id } = useParams();
  return <Report investigationId={id!} />;
}
