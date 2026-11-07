// Lets plain `node` (TS type stripping) run src/ files, whose imports omit the .ts extension.
// Loaded with --import; registers itself as a resolve hook in Node's off-thread hooks worker.
import { register } from "node:module";
import { isMainThread } from "node:worker_threads";

if (isMainThread) register(import.meta.url);

type Resolved = { url: string };
type NextResolve = (specifier: string, context: unknown) => Promise<Resolved>;

export async function resolve(
  specifier: string,
  context: unknown,
  next: NextResolve,
): Promise<Resolved> {
  try {
    return await next(specifier, context);
  } catch (error) {
    if (!specifier.startsWith(".")) throw error;
    return next(`${specifier}.ts`, context).catch(() =>
      next(`${specifier}/index.ts`, context),
    );
  }
}
