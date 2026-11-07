import { serve } from "inngest/next";

import { inngest } from "@/src/inngest/client";
import { functions } from "@/src/inngest/functions";

// Inngest signs every request with INNGEST_SIGNING_KEY; serve() rejects unsigned calls outside dev mode.
export const { GET, POST, PUT } = serve({ client: inngest, functions });
