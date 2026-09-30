import React from "react";
import { createRoot } from "react-dom/client";
import { __federation_method_getRemote, __federation_method_unwrapDefault } from "__federation__";
import "./style.css";

const module = await __federation_method_getRemote("care_onboarding_fe", "./manifest");
const manifest = __federation_method_unwrapDefault(module);
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <aside className="host-sidebar"><strong>CARE</strong><p>Administration</p><p>Facility Setup</p></aside>
    <main className="host-main">
      {manifest.routes["/admin/onboarding"]()}
    </main>
  </React.StrictMode>,
);
