import { OidcSettingsPanel } from '@/components/settings/OidcSettingsPanel';
import { DexUsersPanel } from '@/components/settings/DexUsersPanel';

export function OidcSettingsPage() {
  return (
    <div className="max-w-3xl space-y-8">
      <div>
        <h2 className="text-xl font-semibold text-gray-900">OIDC Settings</h2>
        <p className="text-sm text-neutral-gray mt-1">
          Configure the platform-wide OIDC issuer and client credentials. Saving propagates the
          issuer URI to all services and writes client configs to science-portal and storage-ui.
        </p>
      </div>
      <OidcSettingsPanel />

      <div className="border-t border-gray-200 pt-8">
        <h2 className="text-xl font-semibold text-gray-900">Dex Users</h2>
        <p className="text-sm text-neutral-gray mt-1">
          Manage static user accounts for Dex (dev/demo mode). These users can log in directly
          without an external identity provider. For production, use Keycloak instead.
        </p>
        <div className="mt-4">
          <DexUsersPanel />
        </div>
      </div>
    </div>
  );
}
