import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { Loader2, Wand2, KeyRound } from 'lucide-react';
import type { PlatformOidcSettings } from '@skaha-orc/shared';
import { PLATFORM_HOSTNAME } from '@skaha-orc/shared';
import { useOidcSettings, useSaveOidcSettings } from '@/hooks/use-oidc';
import { toast } from 'sonner';

type OidcProvider = 'dex' | 'keycloak';

function generateSecret(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes)).replace(/=+$/, '') + '=1';
}

const emptyClient = { clientID: '', clientSecret: '', redirectURI: '', callbackURI: '', scope: '' };

const emptySettings: PlatformOidcSettings = {
  issuerUri: '',
  sciencePortal: { ...emptyClient },
  storageUi: { ...emptyClient },
  skaha: { ...emptyClient },
};

export function OidcSettingsPanel() {
  const { data, isLoading } = useOidcSettings();
  const save = useSaveOidcSettings();

  const { register, handleSubmit, reset, setValue, formState: { isDirty } } = useForm<PlatformOidcSettings>({
    defaultValues: emptySettings,
  });

  useEffect(() => {
    if (data) reset(data);
  }, [data, reset]);

  const onSubmit = (values: PlatformOidcSettings) => {
    save.mutate(values, {
      onSuccess: (result) => {
        toast.success(`OIDC settings saved (${result.updated} files updated)`);
        reset(values);
      },
      onError: (err) => toast.error(`Failed to save: ${err.message}`),
    });
  };

  const autoConfigure = (provider: OidcProvider) => {
    const host = PLATFORM_HOSTNAME;

    if (provider === 'dex') {
      setValue('issuerUri', `https://${host}/dex`, { shouldDirty: true });
    } else {
      setValue('issuerUri', `https://${host}/auth/realms/skaha`, { shouldDirty: true });
    }

    // Science Portal: redirectURI = Java OIDC callback handler, callbackURI = base service path
    setValue('sciencePortal.clientID', 'science-portal', { shouldDirty: true });
    setValue('sciencePortal.clientSecret', provider === 'dex' ? generateSecret() : '', { shouldDirty: true });
    setValue('sciencePortal.redirectURI', `https://${host}/science-portal/oidc-callback`, { shouldDirty: true });
    setValue('sciencePortal.callbackURI', `https://${host}/science-portal`, { shouldDirty: true });
    setValue('sciencePortal.scope', 'openid profile offline_access', { shouldDirty: true });

    // Storage UI
    setValue('storageUi.clientID', 'storage-ui', { shouldDirty: true });
    setValue('storageUi.clientSecret', provider === 'dex' ? generateSecret() : '', { shouldDirty: true });
    setValue('storageUi.redirectURI', `https://${host}/storage/oidc-callback`, { shouldDirty: true });
    setValue('storageUi.callbackURI', `https://${host}/storage`, { shouldDirty: true });
    setValue('storageUi.scope', 'openid profile offline_access', { shouldDirty: true });

    // Skaha
    setValue('skaha.clientID', 'skaha', { shouldDirty: true });
    setValue('skaha.clientSecret', provider === 'dex' ? generateSecret() : '', { shouldDirty: true });
    setValue('skaha.redirectURI', `https://${host}/skaha`, { shouldDirty: true });
    setValue('skaha.callbackURI', `https://${host}/skaha/oidc-callback`, { shouldDirty: true });
    setValue('skaha.scope', 'openid profile offline_access', { shouldDirty: true });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-congress-blue" />
      </div>
    );
  }

  const inputClass = 'w-full px-3 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-congress-blue focus:border-congress-blue';
  const labelClass = 'block text-sm font-medium text-gray-700 mb-1';

  const secretField = (name: 'sciencePortal.clientSecret' | 'storageUi.clientSecret' | 'skaha.clientSecret') => (
    <div>
      <label className={labelClass}>Client Secret</label>
      <div className="flex gap-1.5">
        <input {...register(name)} type="password" className={inputClass} />
        <button
          type="button"
          onClick={() => setValue(name, generateSecret(), { shouldDirty: true })}
          className="flex items-center gap-1 px-2 py-1.5 border border-gray-300 rounded-md text-xs text-gray-600 hover:bg-gray-50 transition-colors whitespace-nowrap"
          title="Generate random secret"
        >
          <KeyRound className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
      {/* Issuer URI */}
      <div>
        <label className={labelClass}>OIDC Issuer URI</label>
        <input {...register('issuerUri')} className={inputClass} placeholder="https://example.com/dex" />
        <p className="mt-1 text-xs text-neutral-gray">Propagated to posix-mapper, skaha, cavern, science-portal, and storage-ui</p>
      </div>

      {/* Science Portal */}
      <fieldset className="border border-gray-200 rounded-lg p-4">
        <legend className="text-sm font-semibold text-gray-900 px-2">Science Portal Client</legend>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Client ID</label>
            <input {...register('sciencePortal.clientID')} className={inputClass} />
          </div>
          {secretField('sciencePortal.clientSecret')}
          <div>
            <label className={labelClass}>Redirect URI</label>
            <input {...register('sciencePortal.redirectURI')} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Callback URI</label>
            <input {...register('sciencePortal.callbackURI')} className={inputClass} />
          </div>
          <div className="col-span-2">
            <label className={labelClass}>Scope</label>
            <input {...register('sciencePortal.scope')} className={inputClass} />
          </div>
        </div>
      </fieldset>

      {/* Storage UI */}
      <fieldset className="border border-gray-200 rounded-lg p-4">
        <legend className="text-sm font-semibold text-gray-900 px-2">Storage UI Client</legend>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Client ID</label>
            <input {...register('storageUi.clientID')} className={inputClass} />
          </div>
          {secretField('storageUi.clientSecret')}
          <div>
            <label className={labelClass}>Redirect URI</label>
            <input {...register('storageUi.redirectURI')} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Callback URI</label>
            <input {...register('storageUi.callbackURI')} className={inputClass} />
          </div>
          <div className="col-span-2">
            <label className={labelClass}>Scope</label>
            <input {...register('storageUi.scope')} className={inputClass} />
          </div>
        </div>
      </fieldset>

      {/* Skaha */}
      <fieldset className="border border-gray-200 rounded-lg p-4">
        <legend className="text-sm font-semibold text-gray-900 px-2">Skaha Client</legend>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Client ID</label>
            <input {...register('skaha.clientID')} className={inputClass} />
          </div>
          {secretField('skaha.clientSecret')}
          <div>
            <label className={labelClass}>Redirect URI</label>
            <input {...register('skaha.redirectURI')} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Callback URI</label>
            <input {...register('skaha.callbackURI')} className={inputClass} />
          </div>
          <div className="col-span-2">
            <label className={labelClass}>Scope</label>
            <input {...register('skaha.scope')} className={inputClass} />
          </div>
        </div>
      </fieldset>

      {/* Actions */}
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={!isDirty || save.isPending}
          className="flex items-center gap-2 bg-congress-blue text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-prussian-blue transition-colors disabled:opacity-50"
        >
          {save.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
          Save & Propagate
        </button>

        <button
          type="button"
          onClick={() => autoConfigure('dex')}
          className="flex items-center gap-2 border border-congress-blue text-congress-blue px-4 py-2 rounded-md text-sm font-medium hover:bg-light-blue transition-colors"
        >
          <Wand2 className="w-4 h-4" />
          Auto-configure for Dex
        </button>

        <button
          type="button"
          onClick={() => autoConfigure('keycloak')}
          className="flex items-center gap-2 border border-congress-blue text-congress-blue px-4 py-2 rounded-md text-sm font-medium hover:bg-light-blue transition-colors"
        >
          <Wand2 className="w-4 h-4" />
          Auto-configure for Keycloak
        </button>
      </div>
    </form>
  );
}
