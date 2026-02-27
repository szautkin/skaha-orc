import type { FieldDef } from './FieldRenderer';
import type { FieldSection } from './DynamicForm';
import type { ServiceId } from '@skaha-orc/shared';

const commonIdentity: FieldDef[] = [
  { name: 'hostname', label: 'Hostname', type: 'text', path: 'deployment.hostname' },
];

const commonResources = (prefix: string): FieldDef[] => [
  {
    name: 'reqMem',
    label: 'Memory Request',
    type: 'text',
    path: `${prefix}.resources.requests.memory`,
  },
  { name: 'reqCpu', label: 'CPU Request', type: 'text', path: `${prefix}.resources.requests.cpu` },
  {
    name: 'limMem',
    label: 'Memory Limit',
    type: 'text',
    path: `${prefix}.resources.limits.memory`,
  },
  { name: 'limCpu', label: 'CPU Limit', type: 'text', path: `${prefix}.resources.limits.cpu` },
];

const oidcFields = (prefix: string): FieldDef[] => [
  { name: 'oidcUri', label: 'OIDC URI', type: 'text', path: `${prefix}.oidc.uri` },
  { name: 'clientId', label: 'Client ID', type: 'text', path: `${prefix}.oidc.clientID` },
  {
    name: 'clientSecret',
    label: 'Client Secret',
    type: 'password',
    path: `${prefix}.oidc.clientSecret`,
  },
  { name: 'redirectUri', label: 'Redirect URI', type: 'text', path: `${prefix}.oidc.redirectURI` },
  {
    name: 'callbackUri',
    label: 'Callback URI',
    type: 'text',
    path: `${prefix}.oidc.callbackURI`,
  },
  { name: 'scope', label: 'Scope', type: 'text', path: `${prefix}.oidc.scope` },
];

const extraHostsSection: FieldSection = {
  title: 'Network',
  fields: [
    {
      name: 'extraHosts',
      label: 'Extra Hosts (/etc/hosts)',
      type: 'extra-hosts',
      path: 'deployment.extraHosts',
    },
  ],
};

export const SERVICE_FIELD_DEFS: Partial<Record<ServiceId, FieldSection[]>> = {
  base: [
    {
      title: 'Traefik',
      fields: [
        { name: 'install', label: 'Install Traefik', type: 'boolean', path: 'traefik.install' },
        {
          name: 'logLevel',
          label: 'Log Level',
          type: 'select',
          path: 'traefik.logs.general.level',
          options: ['DEBUG', 'INFO', 'WARN', 'ERROR'],
        },
      ],
    },
  ],
  volumes: [
    {
      title: 'Cavern Storage',
      fields: [
        {
          name: 'storageClassName',
          label: 'Storage Class',
          type: 'text',
          path: 'cavern.storageClassName',
          placeholder: 'Leave empty for default',
        },
        { name: 'capacity', label: 'Capacity', type: 'text', path: 'cavern.capacity' },
        {
          name: 'hostPath',
          label: 'Host Path (local dev)',
          type: 'text',
          path: 'cavern.hostPath',
          placeholder: '/var/lib/k8s-pvs/science-platform',
        },
        {
          name: 'nfsServer',
          label: 'NFS Server (production)',
          type: 'text',
          path: 'cavern.nfs.server',
          placeholder: 'Leave empty to use Host Path',
        },
        { name: 'nfsPath', label: 'NFS Path', type: 'text', path: 'cavern.nfs.path' },
      ],
    },
  ],
  'posix-mapper-db': [
    {
      title: 'PostgreSQL',
      fields: [
        { name: 'pgImage', label: 'Postgres Image', type: 'text', path: 'postgres.image' },
        {
          name: 'pgUser',
          label: 'Username',
          type: 'text',
          path: 'postgres.auth.username',
        },
        {
          name: 'pgPass',
          label: 'Password',
          type: 'password',
          path: 'postgres.auth.password',
        },
        {
          name: 'pgDb',
          label: 'Database',
          type: 'text',
          path: 'postgres.auth.database',
        },
        {
          name: 'pgSchema',
          label: 'Schema',
          type: 'text',
          path: 'postgres.auth.schema',
        },
      ],
    },
    {
      title: 'Storage',
      fields: [
        {
          name: 'storageSize',
          label: 'Storage Size',
          type: 'text',
          path: 'postgres.storage.spec.resources.requests.storage',
        },
      ],
    },
    extraHostsSection,
  ],
  'posix-mapper': [
    {
      title: 'Identity',
      fields: [
        ...commonIdentity,
        {
          name: 'image',
          label: 'Image',
          type: 'text',
          path: 'deployment.posixMapper.image',
        },
        {
          name: 'registryURL',
          label: 'Registry URL',
          type: 'text',
          path: 'deployment.posixMapper.registryURL',
        },
        {
          name: 'oidcURI',
          label: 'OIDC URI',
          type: 'text',
          path: 'deployment.posixMapper.oidcURI',
        },
        {
          name: 'gmsID',
          label: 'GMS ID',
          type: 'text',
          path: 'deployment.posixMapper.gmsID',
        },
        {
          name: 'minUID',
          label: 'Min UID',
          type: 'number',
          path: 'deployment.posixMapper.minUID',
        },
      ],
    },
    {
      title: 'Authorization',
      fields: [
        {
          name: 'authorizedClients',
          label: 'Authorized Clients',
          type: 'textarea',
          path: 'deployment.posixMapper.authorizedClients',
          placeholder: 'Comma-separated list of authorized client URIs',
        },
      ],
    },
    {
      title: 'Resources',
      fields: commonResources('deployment.posixMapper'),
    },
    {
      title: 'PostgreSQL',
      fields: [
        {
          name: 'pgInstall',
          label: 'Install PostgreSQL',
          type: 'boolean',
          path: 'postgresql.install',
        },
        { name: 'pgImage', label: 'Postgres Image', type: 'text', path: 'postgresql.image' },
        {
          name: 'pgUser',
          label: 'Username',
          type: 'text',
          path: 'postgresql.auth.username',
        },
        {
          name: 'pgPass',
          label: 'Password',
          type: 'password',
          path: 'postgresql.auth.password',
        },
        {
          name: 'pgDb',
          label: 'Database',
          type: 'text',
          path: 'postgresql.auth.database',
        },
      ],
    },
    extraHostsSection,
  ],
  skaha: [
    {
      title: 'Identity',
      fields: [
        ...commonIdentity,
        {
          name: 'registryURL',
          label: 'Registry URL',
          type: 'text',
          path: 'deployment.skaha.registryURL',
        },
        {
          name: 'oidcURI',
          label: 'OIDC URI',
          type: 'text',
          path: 'deployment.skaha.oidcURI',
        },
        {
          name: 'gmsID',
          label: 'GMS ID',
          type: 'text',
          path: 'deployment.skaha.gmsID',
        },
        {
          name: 'posixMapperResourceID',
          label: 'POSIX Mapper Resource ID',
          type: 'text',
          path: 'deployment.skaha.posixMapperResourceID',
        },
        {
          name: 'skahaTld',
          label: 'Skaha TLD',
          type: 'text',
          path: 'deployment.skaha.skahaTld',
        },
        {
          name: 'usersGroup',
          label: 'Users Group',
          type: 'text',
          path: 'deployment.skaha.usersGroup',
        },
        {
          name: 'adminsGroup',
          label: 'Admins Group',
          type: 'text',
          path: 'deployment.skaha.adminsGroup',
        },
        {
          name: 'headlessGroup',
          label: 'Headless Group',
          type: 'text',
          path: 'deployment.skaha.headlessGroup',
        },
      ],
    },
    {
      title: 'Sessions',
      fields: [
        {
          name: 'maxCount',
          label: 'Max Sessions',
          type: 'text',
          path: 'deployment.skaha.sessions.maxCount',
        },
        {
          name: 'gpuEnabled',
          label: 'GPU Enabled',
          type: 'boolean',
          path: 'deployment.skaha.sessions.gpuEnabled',
        },
        {
          name: 'registryHosts',
          label: 'Registry Hosts',
          type: 'text',
          path: 'deployment.skaha.registryHosts',
        },
      ],
    },
    {
      title: 'User Storage',
      fields: [
        {
          name: 'topLevelDirectory',
          label: 'Top Level Directory',
          type: 'text',
          path: 'deployment.skaha.sessions.userStorage.topLevelDirectory',
          placeholder: '/cavern',
        },
        {
          name: 'homeDirectory',
          label: 'Home Directory',
          type: 'text',
          path: 'deployment.skaha.sessions.userStorage.homeDirectory',
          placeholder: 'home',
        },
        {
          name: 'projectsDirectory',
          label: 'Projects Directory',
          type: 'text',
          path: 'deployment.skaha.sessions.userStorage.projectsDirectory',
          placeholder: 'projects',
        },
        {
          name: 'userStoragePvc',
          label: 'PVC Name (workload)',
          type: 'text',
          path: 'deployment.skaha.sessions.userStorage.persistentVolumeClaimName',
          placeholder: 'skaha-workload-cavern-pvc',
        },
        {
          name: 'serviceURI',
          label: 'Cavern Service URI',
          type: 'text',
          path: 'deployment.skaha.sessions.userStorage.serviceURI',
          placeholder: 'ivo://cadc.nrc.ca/cavern',
        },
        {
          name: 'nodeURIPrefix',
          label: 'Cavern Node URI Prefix',
          type: 'text',
          path: 'deployment.skaha.sessions.userStorage.nodeURIPrefix',
          placeholder: 'vos://cadc.nrc.ca~cavern',
        },
        {
          name: 'adminApiKey',
          label: 'Admin API Key (Cavern auth)',
          type: 'password',
          path: 'deployment.skaha.sessions.userStorage.admin.auth.apiKey',
          placeholder: 'Auto-generated on startup',
        },
      ],
    },
    {
      title: 'Storage',
      fields: [
        {
          name: 'pvcClaimName',
          label: 'PVC Claim Name',
          type: 'text',
          path: 'storage.service.spec.persistentVolumeClaim.claimName',
        },
      ],
    },
    {
      title: 'Resources',
      fields: commonResources('deployment.skaha'),
    },
    extraHostsSection,
  ],
  'science-portal': [
    {
      title: 'Identity',
      fields: [
        ...commonIdentity,
        {
          name: 'image',
          label: 'Image',
          type: 'text',
          path: 'deployment.sciencePortal.image',
        },
        {
          name: 'registryURL',
          label: 'Registry URL',
          type: 'text',
          path: 'deployment.sciencePortal.registryURL',
        },
        {
          name: 'themeName',
          label: 'Theme',
          type: 'select',
          path: 'deployment.sciencePortal.themeName',
          options: ['src', 'canfar'],
        },
        {
          name: 'skahaResourceID',
          label: 'Skaha Resource ID',
          type: 'text',
          path: 'deployment.sciencePortal.skahaResourceID',
        },
        {
          name: 'gmsID',
          label: 'GMS ID',
          type: 'text',
          path: 'deployment.sciencePortal.gmsID',
        },
        {
          name: 'storageXmlInfoUrl',
          label: 'Storage XML Info URL',
          type: 'text',
          path: 'deployment.sciencePortal.storageXmlInfoUrl',
        },
      ],
    },
    {
      title: 'Sessions',
      fields: [
        {
          name: 'bannerText',
          label: 'Banner Text',
          type: 'textarea',
          path: 'deployment.sciencePortal.sessions.bannerText',
          placeholder: 'Banner text displayed in the science portal',
        },
      ],
    },
    {
      title: 'OIDC',
      fields: oidcFields('deployment.sciencePortal'),
    },
    {
      title: 'Resources',
      fields: commonResources('deployment.sciencePortal'),
    },
    extraHostsSection,
  ],
  cavern: [
    {
      title: 'Identity',
      fields: [
        ...commonIdentity,
        { name: 'image', label: 'Image', type: 'text', path: 'deployment.cavern.image' },
        {
          name: 'registryURL',
          label: 'Registry URL',
          type: 'text',
          path: 'deployment.cavern.registryURL',
        },
        {
          name: 'oidcURI',
          label: 'OIDC URI',
          type: 'text',
          path: 'deployment.cavern.oidcURI',
        },
        {
          name: 'resourceID',
          label: 'Resource ID',
          type: 'text',
          path: 'deployment.cavern.resourceID',
        },
        {
          name: 'posixMapperResourceID',
          label: 'POSIX Mapper Resource ID',
          type: 'text',
          path: 'deployment.cavern.posixMapperResourceID',
        },
        {
          name: 'gmsID',
          label: 'GMS ID',
          type: 'text',
          path: 'deployment.cavern.gmsID',
        },
        {
          name: 'identityManagerClass',
          label: 'Identity Manager',
          type: 'select',
          path: 'deployment.cavern.identityManagerClass',
          options: [
            'org.opencadc.posix.mapper.PosixIdentityManager',
            'ca.nrc.cadc.auth.X500IdentityManager',
          ],
        },
      ],
    },
    {
      title: 'Filesystem',
      fields: [
        {
          name: 'dataDir',
          label: 'Data Directory',
          type: 'text',
          path: 'deployment.cavern.filesystem.dataDir',
        },
        {
          name: 'subPath',
          label: 'Sub Path',
          type: 'text',
          path: 'deployment.cavern.filesystem.subPath',
        },
        {
          name: 'rootOwnerUsername',
          label: 'Root Owner Username',
          type: 'text',
          path: 'deployment.cavern.filesystem.rootOwner.username',
          placeholder: 'root',
        },
        {
          name: 'rootOwnerUid',
          label: 'Root Owner UID',
          type: 'number',
          path: 'deployment.cavern.filesystem.rootOwner.uid',
        },
        {
          name: 'rootOwnerGid',
          label: 'Root Owner GID',
          type: 'number',
          path: 'deployment.cavern.filesystem.rootOwner.gid',
        },
      ],
    },
    {
      title: 'UWS Database',
      fields: [
        {
          name: 'uwsInstall',
          label: 'Install UWS DB',
          type: 'boolean',
          path: 'deployment.cavern.uws.db.install',
        },
        {
          name: 'uwsDb',
          label: 'Database',
          type: 'text',
          path: 'deployment.cavern.uws.db.database',
        },
        {
          name: 'uwsUser',
          label: 'Username',
          type: 'text',
          path: 'deployment.cavern.uws.db.username',
        },
        {
          name: 'uwsPass',
          label: 'Password',
          type: 'password',
          path: 'deployment.cavern.uws.db.password',
        },
      ],
    },
    {
      title: 'Storage',
      fields: [
        {
          name: 'pvcClaimName',
          label: 'PVC Claim Name',
          type: 'text',
          path: 'storage.service.spec.persistentVolumeClaim.claimName',
          placeholder: 'skaha-pvc',
        },
      ],
    },
    {
      title: 'Admin',
      fields: [
        {
          name: 'adminApiKeySkaha',
          label: 'Admin API Key (Skaha)',
          type: 'password',
          path: 'deployment.cavern.extraConfigData.adminAPIKeys.skaha',
        },
      ],
    },
    {
      title: 'Resources',
      fields: commonResources('deployment.cavern'),
    },
    extraHostsSection,
  ],
  'storage-ui': [
    {
      title: 'Identity',
      fields: [
        ...commonIdentity,
        {
          name: 'registryURL',
          label: 'Registry URL',
          type: 'text',
          path: 'deployment.storageUI.registryURL',
        },
        {
          name: 'themeName',
          label: 'Theme',
          type: 'select',
          path: 'deployment.storageUI.themeName',
          options: ['src', 'canfar'],
        },
        {
          name: 'gmsID',
          label: 'GMS ID',
          type: 'text',
          path: 'deployment.storageUI.gmsID',
        },
      ],
    },
    {
      title: 'Backend',
      fields: [
        {
          name: 'defaultService',
          label: 'Default Service',
          type: 'text',
          path: 'deployment.storageUI.backend.defaultService',
        },
      ],
    },
    {
      title: 'OIDC',
      fields: oidcFields('deployment.storageUI'),
    },
    {
      title: 'Resources',
      fields: commonResources('deployment.storageUI'),
    },
    extraHostsSection,
  ],
  reg: [
    {
      title: 'Registry',
      fields: [
        {
          name: 'hostname',
          label: 'Platform Hostname',
          type: 'text',
          path: 'global.hostname',
        },
        {
          name: 'authority',
          label: 'Authority (IVOA identifier)',
          type: 'text',
          path: 'application.authority',
          placeholder: 'ivo://cadc.nrc.ca/reg',
        },
      ],
    },
    {
      title: 'Service Entries',
      fields: [
        {
          name: 'serviceEntries',
          label: 'Resource Capabilities',
          type: 'service-entries',
          path: 'application.serviceEntries',
        },
      ],
    },
    {
      title: 'Ingress',
      fields: [
        {
          name: 'ingressEnabled',
          label: 'Enable Ingress',
          type: 'boolean',
          path: 'ingress.enabled',
        },
        {
          name: 'ingressClass',
          label: 'Ingress Class',
          type: 'text',
          path: 'ingress.className',
          placeholder: 'base-traefik',
        },
      ],
    },
  ],
  keycloak: [
    {
      title: 'Admin',
      fields: [
        { name: 'adminUser', label: 'Admin Username', type: 'text', path: 'auth.adminUser' },
        {
          name: 'adminPassword',
          label: 'Admin Password',
          type: 'password',
          path: 'auth.adminPassword',
        },
      ],
    },
    {
      title: 'Server',
      fields: [
        { name: 'replicas', label: 'Replicas', type: 'number', path: 'replicas' },
        { name: 'proxy', label: 'Proxy Mode', type: 'select', path: 'proxy', options: ['edge', 'reencrypt', 'passthrough'] },
        {
          name: 'httpRelativePath',
          label: 'HTTP Relative Path',
          type: 'text',
          path: 'httpRelativePath',
        },
      ],
    },
    {
      title: 'PostgreSQL',
      fields: [
        {
          name: 'pgEnabled',
          label: 'Enable Built-in PostgreSQL',
          type: 'boolean',
          path: 'postgresql.enabled',
        },
      ],
    },
    {
      title: 'Resources',
      fields: [
        { name: 'reqMem', label: 'Memory Request', type: 'text', path: 'resources.requests.memory' },
        { name: 'reqCpu', label: 'CPU Request', type: 'text', path: 'resources.requests.cpu' },
        { name: 'limMem', label: 'Memory Limit', type: 'text', path: 'resources.limits.memory' },
        { name: 'limCpu', label: 'CPU Limit', type: 'text', path: 'resources.limits.cpu' },
      ],
    },
  ],
  dex: [
    {
      title: 'Issuer',
      fields: [
        { name: 'issuer', label: 'Issuer URI', type: 'text', path: 'issuer' },
      ],
    },
    {
      title: 'Web Server',
      fields: [
        { name: 'webHttp', label: 'HTTP Bind Address', type: 'text', path: 'web.http' },
      ],
    },
    {
      title: 'Storage',
      fields: [
        {
          name: 'storageType',
          label: 'Storage Type',
          type: 'select',
          path: 'storage.type',
          options: ['sqlite3', 'postgres', 'mysql', 'memory'],
        },
        { name: 'storageFile', label: 'DB File Path', type: 'text', path: 'storage.config.file' },
      ],
    },
    {
      title: 'Options',
      fields: [
        {
          name: 'enablePasswordDB',
          label: 'Enable Password DB',
          type: 'boolean',
          path: 'enablePasswordDB',
        },
      ],
    },
  ],
  doi: [
    {
      title: 'Identity',
      fields: [
        ...commonIdentity,
        { name: 'image', label: 'Image', type: 'text', path: 'deployment.doi.image' },
        {
          name: 'registryURL',
          label: 'Registry URL',
          type: 'text',
          path: 'deployment.doi.registryURL',
        },
        {
          name: 'gmsID',
          label: 'GMS ID',
          type: 'text',
          path: 'deployment.doi.gmsID',
        },
      ],
    },
    {
      title: 'DOI Settings',
      fields: [
        {
          name: 'vospaceParentUri',
          label: 'VOSpace Parent URI',
          type: 'text',
          path: 'deployment.doi.vospaceParentUri',
        },
        {
          name: 'groupPrefix',
          label: 'Group Prefix',
          type: 'text',
          path: 'deployment.doi.groupPrefix',
        },
        {
          name: 'doiIdentifierPrefix',
          label: 'DOI Identifier Prefix',
          type: 'text',
          path: 'deployment.doi.doiIdentifierPrefix',
        },
        {
          name: 'publisherGroupURI',
          label: 'Publisher Group URI',
          type: 'text',
          path: 'deployment.doi.publisherGroupURI',
        },
        {
          name: 'randomTestID',
          label: 'Random Test ID',
          type: 'text',
          path: 'deployment.doi.randomTestID',
        },
      ],
    },
    {
      title: 'DataCite',
      fields: [
        {
          name: 'mdsUrl',
          label: 'MDS URL',
          type: 'text',
          path: 'deployment.doi.datacite.mdsUrl',
        },
        {
          name: 'prefix',
          label: 'Account Prefix',
          type: 'text',
          path: 'deployment.doi.datacite.accountPrefix',
        },
        {
          name: 'dcUser',
          label: 'Username',
          type: 'text',
          path: 'deployment.doi.datacite.username',
        },
        {
          name: 'dcPass',
          label: 'Password',
          type: 'password',
          path: 'deployment.doi.datacite.password',
        },
      ],
    },
    {
      title: 'Resources',
      fields: commonResources('deployment.doi'),
    },
    extraHostsSection,
  ],
};
