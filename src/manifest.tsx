import { ClipboardList } from "lucide-react";
import { lazy, Suspense } from "react";

const Onboarding = lazy(() => import("./Onboarding"));

export default {
  plugin: "care_onboarding_fe",
  onboarding: { path: "/onboarding" },
  routes: {
    "/onboarding": () => (
      <Suspense fallback={<p role="status">Opening facility setup...</p>}>
        <Onboarding />
      </Suspense>
    ),
    "/admin/onboarding": () => (
      <Suspense fallback={<p role="status">Opening facility setup...</p>}>
        <Onboarding />
      </Suspense>
    ),
  },
  adminNavItems: [
    { name: "Facility Setup", url: "/admin/onboarding", icon: <ClipboardList className="size-4" /> },
  ],
};
