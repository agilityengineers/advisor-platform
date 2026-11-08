import { Route, Switch } from "wouter";
import { AdminLayout } from "./AdminLayout";
import { CompaniesPage } from "./Companies";
import { TemplatesPage } from "./Templates";
import { RegistryPage } from "./Registry";
import { PlansPage } from "./Plans";
import { SettingsPage } from "./Settings";
import { PlatformCmsPage } from "./PlatformCms";
import { RequestsPage } from "./Requests";
import { AuditPage } from "./Audit";
import { NotFound } from "@/pages/NotFound";

export function PlatformAdmin() {
  return (
    <AdminLayout>
      <Switch>
        <Route path="/" component={CompaniesPage} />
        <Route path="/requests" component={RequestsPage} />
        <Route path="/templates" component={TemplatesPage} />
        <Route path="/registry" component={RegistryPage} />
        <Route path="/plans" component={PlansPage} />
        <Route path="/landing" component={PlatformCmsPage} />
        <Route path="/settings" component={SettingsPage} />
        <Route path="/audit" component={AuditPage} />
        <Route component={NotFound} />
      </Switch>
    </AdminLayout>
  );
}
