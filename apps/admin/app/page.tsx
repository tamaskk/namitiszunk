import { assertIntegerHuf } from "@namitiszunk/core";

// Scaffold page from T-012: proves the app compiles @namitiszunk/core.
export default function Home() {
  return <main data-app="admin" data-core-check={assertIntegerHuf(0)} />;
}
