import { createRoot } from "react-dom/client";

import "@excalidraw/excalidraw/index.css";
import "./index.css";

import App from "./App";

// Deliberately not using <StrictMode>: the editor owns a canvas + pointer
// pipeline and runs best with a single mount, same as excalidraw.com itself.
createRoot(document.getElementById("root")!).render(<App />);
