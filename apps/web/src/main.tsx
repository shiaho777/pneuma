import { createRoot } from "react-dom/client";
import { App } from "@pneuma/ui";
import { createDexieStorage } from "./storage";

createRoot(document.getElementById("root")!).render(
  <App storage={createDexieStorage()} />,
);