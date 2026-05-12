import { BrowserRouter } from "react-router-dom";
import App from "@/App";
import "@/index.css";
import "cesium/Build/Cesium/Widgets/widgets.css";
import React from "react";
import ReactDOM from "react-dom/client";

window.CESIUM_BASE_URL = `${process.env.PUBLIC_URL || ""}/static/cesium`;

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);
