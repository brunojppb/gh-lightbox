// Chrome Web Store API v2: upload a package to an existing item, then submit it for review.
// https://developer.chrome.com/docs/webstore/api/reference/rest

const API = 'https://chromewebstore.googleapis.com';

export type UploadState = 'UPLOAD_STATE_UNSPECIFIED' | 'SUCCEEDED' | 'IN_PROGRESS' | 'FAILED' | 'NOT_FOUND';
export type ItemState =
  | 'ITEM_STATE_UNSPECIFIED'
  | 'PENDING_REVIEW'
  | 'STAGED'
  | 'PUBLISHED'
  | 'PUBLISHED_TO_TESTERS'
  | 'REJECTED'
  | 'CANCELLED';

interface RevisionStatus {
  state?: ItemState;
  distributionChannels?: { crxVersion?: string; deployPercentage?: number }[];
}

export interface ItemStatus {
  publishedItemRevisionStatus?: RevisionStatus;
  submittedItemRevisionStatus?: RevisionStatus;
  lastAsyncUploadState?: UploadState;
  takenDown?: boolean;
  warned?: boolean;
}

interface UploadResponse {
  uploadState?: UploadState;
  crxVersion?: string;
}

interface PublishResponse {
  state?: ItemState;
  warningInfo?: unknown;
}

export interface Item {
  publisherId: string;
  itemId: string;
  /** An OAuth access token with the https://www.googleapis.com/auth/chromewebstore scope. */
  token: string;
}

export interface Deps {
  fetch: typeof fetch;
  sleep: (ms: number) => Promise<void>;
  log: (message: string) => void;
}

export interface PublishOptions {
  /** The zip contents. */
  zip: Uint8Array<ArrayBuffer>;
  /** The version in the zip's manifest. The upload must report the same version. */
  version: string;
  /** How long to wait for an upload that the store processes in the background. */
  uploadTimeoutMs?: number;
  pollIntervalMs?: number;
}

/** A store answer that stops the publish. Its message says what to do next. */
export class StoreError extends Error {
  override name = 'StoreError';
}

const itemPath = ({ publisherId, itemId }: Item): string => `publishers/${publisherId}/items/${itemId}`;

/** Sends one API request and returns the parsed JSON body. */
async function call<T>(deps: Deps, item: Item, method: 'GET' | 'POST', url: string, body?: BodyInit): Promise<T> {
  const headers: Record<string, string> = { Authorization: `Bearer ${item.token}` };
  if (body instanceof Uint8Array) headers['Content-Type'] = 'application/zip';
  else if (body !== undefined) headers['Content-Type'] = 'application/json';
  const response = await deps.fetch(url, { method, headers, ...(body === undefined ? {} : { body }) });
  const text = await response.text();
  if (!response.ok) {
    throw new StoreError(`${method} ${url} answered HTTP ${response.status}: ${text.slice(0, 2000)}`);
  }
  try {
    return (text ? JSON.parse(text) : {}) as T;
  } catch {
    throw new StoreError(`${method} ${url} answered with a body that is not JSON: ${text.slice(0, 500)}`);
  }
}

/** Returns the review and upload status of the item. */
export function fetchStatus(deps: Deps, item: Item): Promise<ItemStatus> {
  return call<ItemStatus>(deps, item, 'GET', `${API}/v2/${itemPath(item)}:fetchStatus`);
}

/**
 * Returns why a new version cannot go to review now, or null when it can.
 * The store reviews one submission at a time, so a pending review blocks the next upload.
 */
export function blockingReason(status: ItemStatus): string | null {
  if (status.takenDown) return 'The store took the item down for a policy violation. Read the developer dashboard.';
  const submitted = status.submittedItemRevisionStatus;
  if (submitted?.state === 'PENDING_REVIEW') {
    const version = submitted.distributionChannels?.[0]?.crxVersion ?? 'an earlier version';
    return (
      `Version ${version} is still in review. Wait for the review to finish, then run the ` +
      '"Publish to Chrome Web Store" workflow again for this version. To replace the version in review, ' +
      'cancel its submission in the developer dashboard first.'
    );
  }
  return null;
}

/** Uploads the zip and waits until the store has processed it. */
async function upload(deps: Deps, item: Item, options: PublishOptions): Promise<void> {
  const url = `${API}/upload/v2/${itemPath(item)}:upload`;
  const result = await call<UploadResponse>(deps, item, 'POST', url, options.zip);
  let state = result.uploadState;
  const deadline = Date.now() + (options.uploadTimeoutMs ?? 300_000);
  while (state === 'IN_PROGRESS') {
    if (Date.now() > deadline) throw new StoreError('The store did not finish processing the upload in time.');
    deps.log('The store is processing the upload.');
    await deps.sleep(options.pollIntervalMs ?? 5_000);
    state = (await fetchStatus(deps, item)).lastAsyncUploadState;
  }
  if (state !== 'SUCCEEDED') {
    throw new StoreError(
      `The upload ended in state ${state ?? 'unknown'}. Read the developer dashboard for the reason.`,
    );
  }
  // crxVersion is unset for an upload that ran in the background, so only a direct answer can be checked.
  if (result.crxVersion !== undefined && result.crxVersion !== options.version) {
    throw new StoreError(
      `The store read version ${result.crxVersion} from the zip, but this release is ${options.version}.`,
    );
  }
}

/** Submits the uploaded package for review. It goes live once the review approves it. */
async function submit(deps: Deps, item: Item): Promise<ItemState | undefined> {
  const url = `${API}/v2/${itemPath(item)}:publish`;
  const result = await call<PublishResponse>(
    deps,
    item,
    'POST',
    url,
    JSON.stringify({ publishType: 'DEFAULT_PUBLISH' }),
  );
  if (result.warningInfo) deps.log(`The store sent warnings: ${JSON.stringify(result.warningInfo)}`);
  const accepted: (ItemState | undefined)[] = ['PENDING_REVIEW', 'STAGED', 'PUBLISHED', 'PUBLISHED_TO_TESTERS'];
  if (!accepted.includes(result.state)) {
    throw new StoreError(
      `The store did not accept the submission. It answered with state ${result.state ?? 'unknown'}.`,
    );
  }
  return result.state;
}

/** Uploads a new version of an existing item and submits it for review. */
export async function publishVersion(deps: Deps, item: Item, options: PublishOptions): Promise<ItemState | undefined> {
  const blocked = blockingReason(await fetchStatus(deps, item));
  if (blocked) throw new StoreError(blocked);
  deps.log(`Uploading version ${options.version}.`);
  await upload(deps, item, options);
  deps.log('Upload done. Submitting for review.');
  const state = await submit(deps, item);
  deps.log(`Submitted version ${options.version}. Store state: ${state}.`);
  return state;
}
