export type ServiceInstallType = 'shape';
export type ServiceEntryType = 'shape';
export type ServicePricingMode = 'free' | 'premium' | 'license';
export type ServicePermission = 'network' | 'local_file' | 'clipboard';
type ServiceAuthMode = 'none' | 'optional' | 'required';

export interface ServiceManifestV1 {
  schema_version?: '1';
  id: string;
  name: string;
  summary?: string;
  version: string;
  icon?: string;
  category: string;
  install_type: ServiceInstallType;
  entry: {
    type: ServiceEntryType;
    shape_type: string;
    title?: string;
    icon?: string;
    props?: Record<string, any>;
  };
  runtime?: {
    mode: 'local';
    route?: string;
  };
  source: {
    article_slug: string;
    locale?: string;
  };
  api?: Array<{
    id: string;
    endpoint: string;
    method: 'GET' | 'POST';
    auth?: ServiceAuthMode;
  }>;
  outputs?: {
    primary?: string[];
    cards?: string[];
  };
  permissions?: ServicePermission[];
  pricing: {
    mode: ServicePricingMode;
    price_id?: string;
    purchase_url?: string;
  };
  install?: {
    auto_add_to_shape_library?: boolean;
    auto_create_entry_shape?: boolean;
  };
  compatibility?: {
    min_host_version?: string;
    fallback_prompt?: string;
  };
}

function isObject(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function readString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function readOptionalString(value: unknown) {
  const text = readString(value);
  return text || undefined;
}

function readBoolean(value: unknown) {
  return typeof value === 'boolean' ? value : undefined;
}

function readStringArray(value: unknown) {
  if (!Array.isArray(value)) return undefined;
  const items = value
    .map((item) => readString(item))
    .filter(Boolean);
  return items.length ? items : undefined;
}

export function normalizeServiceManifest(value: unknown): ServiceManifestV1 | null {
  if (!isObject(value)) return null;

  const id = readString(value.id);
  const name = readString(value.name);
  const version = readString(value.version);
  const category = readString(value.category);
  const installType = readString(value.install_type) || 'shape';
  const entry = isObject(value.entry) ? value.entry : null;
  const shapeType = readString(entry?.shape_type);
  const source = isObject(value.source) ? value.source : null;
  const articleSlug = readString(source?.article_slug);

  if (!id || !name || !version || !category || installType !== 'shape' || !entry || !shapeType || !articleSlug) {
    return null;
  }

  const pricing = isObject(value.pricing) ? value.pricing : null;
  const pricingMode = readString(pricing?.mode);
  const runtime = isObject(value.runtime) ? value.runtime : null;
  const api = Array.isArray(value.api)
    ? value.api
        .map((item) => {
          if (!isObject(item)) return null;
          const apiId = readString(item.id);
          const endpoint = readString(item.endpoint);
          const method = readString(item.method).toUpperCase();
          const auth = readOptionalString(item.auth);
          let normalizedAuth: ServiceAuthMode | undefined;
          if (auth === 'none' || auth === 'optional' || auth === 'required') {
            normalizedAuth = auth;
          }
          if (!apiId || !endpoint || (method !== 'GET' && method !== 'POST')) return null;
          return {
            id: apiId,
            endpoint,
            method: method as 'GET' | 'POST',
            auth: normalizedAuth,
          };
        })
        .filter((item): item is NonNullable<typeof item> => Boolean(item))
    : undefined;
  const outputs = isObject(value.outputs) ? value.outputs : null;
  const install = isObject(value.install) ? value.install : null;
  const compatibility = isObject(value.compatibility) ? value.compatibility : null;

  return {
    schema_version: '1',
    id,
    name,
    summary: readOptionalString(value.summary),
    version,
    icon: readOptionalString(value.icon),
    category,
    install_type: 'shape',
    entry: {
      type: 'shape',
      shape_type: shapeType,
      title: readOptionalString(entry.title),
      icon: readOptionalString(entry.icon),
      props: isObject(entry.props) ? entry.props : undefined,
    },
    runtime: runtime
      ? {
          mode: 'local',
          route: readOptionalString(runtime.route),
        }
      : undefined,
    source: {
      article_slug: articleSlug,
      locale: readOptionalString(source?.locale),
    },
    api: api?.length ? api : undefined,
    outputs: outputs
      ? {
          primary: readStringArray(outputs.primary),
          cards: readStringArray(outputs.cards),
        }
      : undefined,
    permissions: (readStringArray(value.permissions) as ServicePermission[] | undefined)?.filter(Boolean),
    pricing: {
      mode: pricingMode === 'premium' || pricingMode === 'license' ? pricingMode : 'free',
      price_id: readOptionalString(pricing?.price_id),
      purchase_url: readOptionalString(pricing?.purchase_url),
    },
    install: install
      ? {
          auto_add_to_shape_library: readBoolean(install.auto_add_to_shape_library),
          auto_create_entry_shape: readBoolean(install.auto_create_entry_shape),
        }
      : undefined,
    compatibility: compatibility
      ? {
          min_host_version: readOptionalString(compatibility.min_host_version),
          fallback_prompt: readOptionalString(compatibility.fallback_prompt),
        }
      : undefined,
  };
}

export function parseServiceManifestParam(value: string | null | undefined) {
  if (!value) return null;
  try {
    return normalizeServiceManifest(JSON.parse(value));
  } catch {
    return null;
  }
}

export function serializeServiceManifest(manifest: ServiceManifestV1) {
  return JSON.stringify(manifest);
}

export function getServiceManifestEntryProps(manifest: ServiceManifestV1) {
  const baseTitle = manifest.entry.title || manifest.name;
  const props = { ...(manifest.entry.props || {}) };

  if (props.name == null) props.name = baseTitle;
  if (props.title == null) props.title = baseTitle;
  if (props.description == null && manifest.summary) props.description = manifest.summary;
  if (props.w == null) props.w = 420;
  if (props.h == null) props.h = 520;

  return props;
}
