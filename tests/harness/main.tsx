import React from "react";
import { createRoot } from "react-dom/client";
import { __federation_method_getRemote, __federation_method_unwrapDefault } from "__federation__";
import "./style.css";

const module = await __federation_method_getRemote("care_onboarding_fe", "./manifest");
const manifest = __federation_method_unwrapDefault(module);
const DashboardOverride = manifest.overrides.find((entry: { component: string }) => entry.component === "UserDashboard")?.replacement;
function Dashboard() {
  return <h1>CARE dashboard</h1>;
}
const content = window.location.pathname === "/"
  ? <DashboardOverride __base={Dashboard} />
  : manifest.routes[window.location.pathname]?.();
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <aside className="host-sidebar"><strong>CARE</strong><p>Administration</p><p>Facility Setup</p></aside>
    <main className="host-main">
      {content}
    </main>
  </React.StrictMode>,
);
