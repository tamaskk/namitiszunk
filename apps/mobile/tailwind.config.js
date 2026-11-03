const tokens = require("@namitiszunk/ui/tokens.json");

// React Native wants line heights in points, not multipliers.
const fontSize = Object.fromEntries(
  Object.entries(tokens.text).map(([name, role]) => {
    const size = Number.parseFloat(role.size);
    return [
      name,
      [
        `${size}px`,
        {
          lineHeight: `${Math.round(size * role.lineHeight)}px`,
          fontWeight: String(role.weight),
          // React Native has no em unit, so letter spacing becomes points too.
          ...(role.letterSpacing && {
            letterSpacing: `${size * Number.parseFloat(role.letterSpacing)}px`,
          }),
        },
      ],
    ];
  }),
);

// Same tokens.json as the web theme; NativeWind 4 runs Tailwind 3, so the config is not shared.
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    colors: { transparent: "transparent", ...tokens.color },
    fontSize,
    extend: { borderRadius: tokens.radius, maxWidth: tokens.container },
  },
  plugins: [],
};
