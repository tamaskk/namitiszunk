const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");

// Expo's default config already resolves pnpm workspace packages; NativeWind adds the CSS pipeline.
module.exports = withNativeWind(getDefaultConfig(__dirname), {
  input: "./global.css",
});
