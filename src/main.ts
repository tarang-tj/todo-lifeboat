import "./style.css";
import { startApp } from "./ui/app";

const root = document.getElementById("app");
if (!root) throw new Error("Missing #app element");
startApp(root, {
  msClientId: import.meta.env.VITE_MS_CLIENT_ID?.trim() ?? "",
  googleClientId: import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim() ?? "",
});
