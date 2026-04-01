import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import App from "./App";
import "./index.css";

registerSW({
	immediate: true,
	onOfflineReady() {
		console.log("App ready to work offline");
	},
});

createRoot(document.getElementById("root")!).render(<App />);
