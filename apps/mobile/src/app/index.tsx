import { assertIntegerHuf } from "@namitiszunk/core";
import { View } from "react-native";

// Scaffold screen from T-012: proves the app resolves @namitiszunk/core and NativeWind.
export default function Home() {
  return (
    <View
      className="flex-1 bg-black"
      testID={`core-check-${assertIntegerHuf(0)}`}
    />
  );
}
