import { Home } from "@/components/rt/Home";

export function meta() {
  return [{ title: "REDTHREAD" }, { name: "description", content: "An investigative workbench for finding the structure inside ambiguous evidence." }];
}

export default function HomeRoute() {
  return <Home />;
}
