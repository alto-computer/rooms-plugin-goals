import { connect } from "@alto-rooms/plugin-sdk";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles.css";

const rooms = await connect();
createRoot(document.getElementById("root")!).render(<App rooms={rooms} />);
