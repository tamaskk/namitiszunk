// Shared by the client gate and the server page: a value exported from a "use client" module
// reaches a server component only as a client reference, never as the string itself.
export const AGE_GATE_STORAGE_KEY = "namitiszunk.ageGate";
export const AGE_GATE_ID = "age-gate";
export const AGE_GATED_CONTENT_ID = "age-gated-content";

/**
 * Runs before first paint, ahead of hydration: a returning adult never sees the gate flash,
 * and a first visit never sees the menu before the gate.
 */
export const ageGatePrePaintScript = `try{if(localStorage.getItem(${JSON.stringify(AGE_GATE_STORAGE_KEY)})==="adult"){var g=document.getElementById("${AGE_GATE_ID}");if(g)g.hidden=true;var c=document.getElementById("${AGE_GATED_CONTENT_ID}");if(c)c.inert=false}}catch(e){}`;
