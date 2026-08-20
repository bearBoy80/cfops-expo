import {
  CloudflareApiError,
  isInvalidListOptions,
  markLegacyListOptions,
  request,
  requestEnvelope,
  requestPaged,
  usesLegacyListOptions,
} from './client';

export interface CfPagesProject {
  name: string;
  /** Primary domain (first of `domains`). */
  domain: string;
  productionBranch: string;
  framework: string;
  /** Underlying Worker script serving Pages Functions, if any. */
  productionScriptName: string | null;
  /** latest deployment info; nulls when the project was never deployed */
  deployStatus: 'success' | 'failure' | 'building' | 'unknown' | null;
  deployBranch: string | null;
  deployCommit: string | null;
  deployedAt: string | null;
}

interface RawPagesProject {
  name: string;
  domains?: string[];
  production_branch?: string;
  production_script_name?: string;
  build_config?: { framework?: string };
  latest_deployment?: {
    deployment_trigger?: { metadata?: { branch?: string; commit_hash?: string } };
    latest_stage?: { name?: string; status?: string };
    created_on?: string;
  };
}

function toDeployStatus(
  stage?: { name?: string; status?: string },
): CfPagesProject['deployStatus'] {
  if (!stage?.status) {
    return 'unknown';
  }
  if (stage.status === 'success' && stage.name === 'deploy') {
    return 'success';
  }
  if (stage.status === 'failure' || stage.status === 'failed') {
    return 'failure';
  }
  if (stage.status === 'success' || stage.status === 'active' || stage.status === 'idle') {
    // A non-final stage succeeded or is running: still building.
    return 'building';
  }
  return 'unknown';
}

function toPagesProject(project: RawPagesProject): CfPagesProject {
  const deployment = project.latest_deployment;
  return {
    name: project.name,
    domain: project.domains?.[0] ?? '',
    productionBranch: project.production_branch ?? '',
    framework: project.build_config?.framework ?? '',
    productionScriptName: project.production_script_name ?? null,
    deployStatus: deployment ? toDeployStatus(deployment.latest_stage) : null,
    deployBranch: deployment?.deployment_trigger?.metadata?.branch ?? null,
    deployCommit:
      deployment?.deployment_trigger?.metadata?.commit_hash?.slice(0, 7) ??
      null,
    deployedAt: deployment?.created_on ?? null,
  };
}

// The endpoint defaults to 10 items per page; ask for the practical maximum
// so most accounts resolve in one round trip.
const PROJECTS_PER_PAGE = 100;

const projectsPath = (accountId: string, withListOptions: boolean) =>
  (page: number) =>
    withListOptions
      ? `/accounts/${accountId}/pages/projects?page=${page}&per_page=${PROJECTS_PER_PAGE}`
      : `/accounts/${accountId}/pages/projects?page=${page}`;

export async function listPagesProjects(
  token: string,
  accountId: string,
): Promise<CfPagesProject[]> {
  const legacyKey = `pages:${accountId}`;
  const list = async (withListOptions: boolean) =>
    (
      await requestPaged<RawPagesProject>(
        projectsPath(accountId, withListOptions),
        token,
      )
    ).map(toPagesProject);

  // Some accounts reject `per_page` outright; `page` still works there.
  if (usesLegacyListOptions(legacyKey)) {
    return list(false);
  }
  try {
    return await list(true);
  } catch (cause) {
    if (!isInvalidListOptions(cause)) {
      throw cause;
    }
    // Remember the rejection so refreshes skip the doomed request entirely.
    markLegacyListOptions(legacyKey);
    return list(false);
  }
}

export interface CfPagesDeployment {
  id: string;
  /** production | preview */
  environment: string;
  branch: string | null;
  commit: string | null;
  status: 'success' | 'failure' | 'building' | 'unknown';
  createdOn: string | null;
  url: string;
}

export async function listPagesDeployments(
  token: string,
  accountId: string,
  projectName: string,
): Promise<CfPagesDeployment[]> {
  const result = await request<
    {
      id: string;
      environment?: string;
      url?: string;
      created_on?: string;
      deployment_trigger?: {
        metadata?: { branch?: string; commit_hash?: string };
      };
      latest_stage?: { name?: string; status?: string };
    }[]
  >(`/accounts/${accountId}/pages/projects/${projectName}/deployments`, token);
  return result.map((deployment) => ({
    id: deployment.id,
    environment: deployment.environment ?? 'production',
    branch: deployment.deployment_trigger?.metadata?.branch ?? null,
    commit:
      deployment.deployment_trigger?.metadata?.commit_hash?.slice(0, 7) ??
      null,
    status: toDeployStatus(deployment.latest_stage) ?? 'unknown',
    createdOn: deployment.created_on ?? null,
    url: deployment.url ?? '',
  }));
}

/** Re-publishes an older deployment as the current production one. */
export async function rollbackPagesDeployment(
  token: string,
  accountId: string,
  projectName: string,
  deploymentId: string,
): Promise<void> {
  await request(
    `/accounts/${accountId}/pages/projects/${projectName}/deployments/${deploymentId}/rollback`,
    token,
    { method: 'POST' },
  );
}

/** Re-runs the build of a failed or cancelled deployment. */
export async function retryPagesDeployment(
  token: string,
  accountId: string,
  projectName: string,
  deploymentId: string,
): Promise<void> {
  await request(
    `/accounts/${accountId}/pages/projects/${projectName}/deployments/${deploymentId}/retry`,
    token,
    { method: 'POST' },
  );
}

export type PagesPreviewSetting = 'all' | 'none' | 'custom';

/**
 * Preview-deployment policy of a git-connected project, or null for
 * direct-upload projects (which have no preview builds to disable).
 */
export async function getPagesPreviewSetting(
  token: string,
  accountId: string,
  projectName: string,
): Promise<PagesPreviewSetting | null> {
  const project = await request<{
    source?: { config?: { preview_deployment_setting?: string } };
  }>(`/accounts/${accountId}/pages/projects/${projectName}`, token);
  if (!project.source) {
    return null;
  }
  const setting = project.source.config?.preview_deployment_setting;
  return setting === 'none' || setting === 'custom' ? setting : 'all';
}

export async function setPagesPreviewSetting(
  token: string,
  accountId: string,
  projectName: string,
  setting: 'all' | 'none',
): Promise<void> {
  // Read-modify-write: patching a partial source object would drop the
  // repo binding and other config fields.
  const project = await request<{
    source?: { type?: string; config?: Record<string, unknown> };
  }>(`/accounts/${accountId}/pages/projects/${projectName}`, token);
  if (!project.source) {
    throw new CloudflareApiError('api');
  }
  await request(`/accounts/${accountId}/pages/projects/${projectName}`, token, {
    method: 'PATCH',
    body: {
      source: {
        ...project.source,
        config: {
          ...project.source.config,
          preview_deployment_setting: setting,
        },
      },
    },
  });
}

export interface CfPagesDomain {
  id: string;
  name: string;
  status: string;
}

export async function listPagesDomains(
  token: string,
  accountId: string,
  projectName: string,
): Promise<CfPagesDomain[]> {
  const result = await request<
    { id?: string; name: string; status?: string }[]
  >(`/accounts/${accountId}/pages/projects/${projectName}/domains`, token);
  return result.map((domain) => ({
    id: domain.id ?? domain.name,
    name: domain.name,
    status: domain.status ?? 'active',
  }));
}

export async function addPagesDomain(
  token: string,
  accountId: string,
  projectName: string,
  name: string,
): Promise<void> {
  await request(
    `/accounts/${accountId}/pages/projects/${projectName}/domains`,
    token,
    { method: 'POST', body: { name } },
  );
}

export async function deletePagesDomain(
  token: string,
  accountId: string,
  projectName: string,
  name: string,
): Promise<void> {
  await request(
    `/accounts/${accountId}/pages/projects/${projectName}/domains/${name}`,
    token,
    { method: 'DELETE' },
  );
}
