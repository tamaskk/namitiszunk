// Ports clear of `pnpm dev` (3001) and of the admin e2e server (3102).
export const E2E_PORT = 3101;
export const E2E_MONGO_URI = "mongodb://127.0.0.1:27117/namitiszunk_e2e";
// Nothing listens here: the tests answer API calls with page.route.
export const E2E_API_URL = "http://localhost:3999";
