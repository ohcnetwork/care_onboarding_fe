import { ClipboardList } from "lucide-react";
import { lazy, Suspense } from "react";

import DashboardOnboarding from "./DashboardOnboarding";

const Onboarding = lazy(() => import("./Onboarding"));

export default {
  plugin: "care_onboarding_fe",
  overrides: [
    { component: "UserDashboard", replacement: DashboardOnboarding },
  ],
  routes: {
    "/onboarding": () => (
      <Suspense fallback={<p role="status">Opening clinic setup...</p>}>
        <Onboarding />
      </Suspense>
    ),
    "/admin/onboarding": () => (
      <Suspense fallback={<p role="status">Opening clinic setup...</p>}>
        <Onboarding />
      </Suspense>
    ),
  },
  adminNavItems: [
    { name: "Clinic setup", url: "/admin/onboarding", icon: <ClipboardList className="size-4" /> },
  ],
};
