import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

// Self-hosted brand fonts (offline-friendly).
import "@fontsource/unbounded/700.css";
import "@fontsource/unbounded/900.css";
import "@fontsource/saira-semi-condensed/700.css";
import "@fontsource/hanken-grotesk/400.css";
import "@fontsource/hanken-grotesk/500.css";
import "@fontsource/hanken-grotesk/600.css";
import "@fontsource/hanken-grotesk/700.css";
import "@fontsource/geist-mono/400.css";

import "./styles/index.css";
import { APP_NAME, COMPANY, APP_VERSION, BUILD_COMMIT, BUILD_TIME } from "@/lib/buildInfo";
import App from "@/App";

// Build-info traceability in the console.
console.info(
  `${APP_NAME} v${APP_VERSION} · build ${BUILD_COMMIT} · ${BUILD_TIME} · a ${COMPANY} app`
);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
