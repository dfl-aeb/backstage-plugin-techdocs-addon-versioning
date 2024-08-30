import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Icon } from '@material-ui/core';
import { MenuItem, Select } from '@material-ui/core';
import './TechDocsVersioningComponent.css';
import WarningIcon from '@material-ui/icons/Warning';
import {
  alertApiRef,
  configApiRef,
  useApi,
  identityApiRef,
  IdentityApi,
} from '@backstage/core-plugin-api';
import { useLocation } from 'react-router-dom';
import { Config } from '@backstage/config';

type BasicEntity = {
  namespace: string;
  kind: string;
  name: string;
};

const componentPrefix = 'techdocs-versioning';
const VERSIONS_DIRECTORY = 'versions';
const DEFAULT_VERSION = 'latest';
let configApi: Config;
let identityApi: IdentityApi;
let backendApiUrl: string;
let backendStaticFilesURL: string;
let basicEntity: BasicEntity;
let rootUrl: URL;
let directoryPath: string;
let entityUid: string;
let version: string;
let versions: Set<string>;

/**
 * Retrieves the basic backstage entity information from the given URL or the current window location.
 * @param href - The URL to extract the entity information from. If not provided, the current window location is used.
 * @returns The basic entity object containing the namespace, kind, and name.
 */
function getBasicEntityFromUrl(href?: string): BasicEntity {
  let entityUrl = href ?? window.location.href;
  entityUrl = entityUrl.replace(window.location.origin, '');
  const parts = entityUrl.split('/');
  return {
    namespace: parts[2] ?? undefined,
    kind: parts[3] ?? undefined,
    name: parts[4] ?? undefined,
  };
}

/**
 * Retrieves the JSON version file from the backend using the provided file URL.
 * This file is needed to display the available versions for the entity.
 * @param fileUrl The URL of the JSON file to retrieve.
 * @returns A Promise that resolves to the JSON data.
 * @throws An error if the network response is not successful.
 */
async function getJsonFileFromBackend(fileUrl: string): Promise<any> {
  const { token } = await identityApi.getCredentials();
  const headers = new Headers({
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  });
  const requestOptions = {
    method: 'GET',
    headers: headers,
  };
  const response = await fetch(fileUrl, requestOptions);
  if (!response.ok) {
    console.error(
      `Could not get techdocs versions.json from FileProvider Backend (could be S3). status: ${response.status}, statusText: ${response.statusText}`,
    );
    return [];
  }
  return response.json();
}

async function getEntityMetadata(): Promise<any> {
  const basicEntity: BasicEntity = getBasicEntityFromUrl();
  const requestEntityURL = `${backendApiUrl}/entity/${basicEntity.namespace}/${basicEntity.kind}/${basicEntity.name}`;

  return getJsonFileFromBackend(requestEntityURL);
}

function getVersionsMetadata() {
  const basicEntity: BasicEntity = getBasicEntityFromUrl();
  const requestVersionsMetadataURL = `${backendStaticFilesURL}/${basicEntity.namespace}/${basicEntity.kind}/${basicEntity.name}/versions.json`;
  return getJsonFileFromBackend(requestVersionsMetadataURL);
}

/**
 * Sets a value in the session storage with a prefixed key to avoid collisions.
 * @param key - The key for the session storage item.
 * @param value - The value to be stored in the session storage.
 */
function setSessionStorage(key: string, value: string) {
  // adding a prefix to avoid collisions with other session storage items
  sessionStorage.setItem(`${componentPrefix}-${key}`, value);
}

/**
 * Retrieves the value associated with the specified key from the session storage.
 *
 * @param key - The key to retrieve the value for.
 * @returns The value associated with the key, or null if the key does not exist.
 */
function getSessionStorage(key: string) {
  return sessionStorage.getItem(`${componentPrefix}-${key}`);
}

/**
 * Checks if the given path is a catalog path.
 * A catalog path starts with '/catalog/' or 'catalog'.
 *
 * @param path - The path to check.
 * @returns True if the path is a catalog path, false otherwise.
 */
function isCatalogPath(path: string): boolean {
  return (
    path.startsWith('/catalog/') ||
    path.startsWith('/catalog') ||
    path.startsWith('catalog')
  );
}

/**
 * Creates the root URL for a given location, basic entity, and catalog path flag.
 * @param location - The location object containing protocol, hostname, and port.
 * @param basicEntity - The basic entity object containing namespace, kind, and name.
 * @param isCatalogPath - A flag indicating whether the path is for the catalog or not.
 * @returns The root URL.
 */
function createRootUrl(
  location: Location,
  basicEntity: BasicEntity,
  isCatalogPath: boolean,
): URL {
  let url: string = '';
  url += `${location.protocol}//${location.hostname}${
    location.port ? `:${location.port}` : ''
  }`;

  // distinguish between catalog and docs paths
  if (isCatalogPath) {
    url += '/catalog';
  } else {
    url += '/docs';
  }
  url += `/${basicEntity.namespace}/${basicEntity.kind}/${basicEntity.name}`;
  url += isCatalogPath ? '/docs' : '';
  return new URL(url);
}

/**
 * Returns the directory path of a given URL relative to the root URL.
 * If the URL is the root directory, an empty string is returned.
 * The version segment in the URL path is removed.
 *
 * @param url The URL for which to retrieve the directory path.
 * @param rootUrl The root URL to calculate the relative path from.
 * @returns The directory path of the URL relative to the root URL.
 */
function getDirectoryPath(url: URL, rootUrl: URL): string {
  const path = url.href.replace(rootUrl.href, '');

  // if the path is the root directory, return an empty string
  if (path === '' || path === '/') {
    return ''; // root directory
  }

  // remove version from path
  const parts = path.split('/');

  // TODO: use filter?
  // const cleanParts = parts.filter((part, index) => {
  //     return part !== '' && (part !== VERSIONS_DIRECTORY || parts[index + 1] !== VERSIONS_DIRECTORY);
  // });
  const cleanParts = [];
  for (let index = 0; index < parts.length; index++) {
    const element = parts[index];
    if (element === '') {
      continue;
    }
    if (element === VERSIONS_DIRECTORY) {
      index++;
      continue;
    }
    cleanParts.push(element);
  }

  return `/${cleanParts.join('/')}`;
}

/**
 * Retrieves the version from the URL based on the provided parameters.
 *
 * @param location - The current location object.
 * @param rootUrl - The root URL of the application.
 * @param directoryPath - The directory path to be removed from the URL.
 * @returns The version extracted from the URL.
 */
function getVersionFromUrl(
  location: Location,
  rootUrl: URL,
  directoryPath: string,
): string {
  version = DEFAULT_VERSION;
  let path = location.href.replace(rootUrl.href, '');
  path = path.replace(directoryPath, '');

  if (path === '' || path === '/') {
    return version;
  }

  version = path
    .split('/')
    .filter(part => part !== '' && part !== VERSIONS_DIRECTORY)[0];

  return version || DEFAULT_VERSION;
}

/**
 * Retrieves the versions of the documentation.
 * @returns A Promise that resolves to a Set of strings representing the versions.
 */
async function getVersions(): Promise<Set<string>> {
  const versionsMetadata: string[] = (await getVersionsMetadata()) as string[];
  versions = new Set<string>();
  versions.add(DEFAULT_VERSION);

  if (versionsMetadata.length !== 0) {
    versionsMetadata.forEach(entry => {
      versions.add(entry);
    });
  }
  return versions;
}

/**
 * Retrieves the UID of the entity by calling the getEntityMetadata function.
 * @returns A Promise that resolves to the UID of the entity.
 * @throws An error if the entity metadata cannot be retrieved after 5 attempts.
 */
async function getEntityUid(): Promise<string> {
  for (let index = 0; index < 5; index++) {
    try {
      const entity = await getEntityMetadata();
      return entity.metadata.uid;
    } catch (error) {
      console.error('Error getting entity metadata, retrying...', error);
    }
  }
  throw new Error('Error getting entity metadata');
}

/**
 * Changes the page version and updates the URL accordingly.
 * @param version - The version to change to.
 */
function changePage(version: string) {
  setSessionStorage(`version-${entityUid}`, version);
  if (version === DEFAULT_VERSION) {
    window.location.replace(rootUrl.href + directoryPath);
  } else {
    window.location.replace(
      `${rootUrl.href}/versions/${version}${directoryPath}`,
    );
  }
}

/**
 * Renders the TechDocs versioning component.
 * This component allows the user to select a version of the documentation to view.
 */
export const TechDocsVersioningComponent = () => {
  configApi = useApi(configApiRef);
  identityApi = useApi(identityApiRef);
  const alertApi = useApi(alertApiRef);
  const location = useLocation();
  backendApiUrl =
    `${configApi
      .getConfig('backend')
      .getString('baseUrl')}/api/techdocs/metadata` ??
    'http://localhost:7007/api/techdocs/metadata';
  backendStaticFilesURL =
    `${configApi
      .getConfig('backend')
      .getString('baseUrl')}/api/techdocs/static/docs` ??
    'http://localhost:7007/api/techdocs/static/docs';
  const [renderedVersion, setVersion] = useState<string>(DEFAULT_VERSION);
  const [renderedVersions, setVersions] = useState(
    new Set<string>([DEFAULT_VERSION]),
  );
  const previousRelevantPathRef = useRef<string>('');

  const handleChange = useCallback(
    (event: React.ChangeEvent<{ value: unknown }>) => {
      version = event.target.value as string;
      setVersion(version);
      changePage(version);
    },
    [],
  );

  useEffect(() => {
    basicEntity = getBasicEntityFromUrl();
    rootUrl = createRootUrl(
      window.location,
      basicEntity,
      isCatalogPath(window.location.pathname),
    );
    directoryPath = getDirectoryPath(new URL(window.location.href), rootUrl);
    version = getVersionFromUrl(window.location, rootUrl, directoryPath);

    async function init() {
      versions = await getVersions();
      setVersions(versions);
      setVersion(version);
      try {
        entityUid = await getEntityUid();
      } catch (error) {
        console.error(error);
        console.error(
          'Check if latest version is available and was built correctly.',
        );
        return;
      }

      // check if a version for this entity was saved in session storage
      const sessionVersion = getSessionStorage(`version-${entityUid}`);

      // if current version that comes from url is not latest and is in the list of versions overwrite or set session storage
      if (version !== DEFAULT_VERSION && versions.has(version)) {
        setSessionStorage(`version-${entityUid}`, version);
        return;
      }

      // if current version that comes from url is latest and a version was saved in session storage, set version to session version
      if (
        version === DEFAULT_VERSION &&
        sessionVersion !== null &&
        sessionVersion !== '' &&
        sessionVersion !== DEFAULT_VERSION &&
        versions.has(sessionVersion)
      ) {
        version = sessionVersion;
        setVersion(version);
        changePage(version);
        return;
      }
    }

    // only call init if the relevant path has changed, to avoid unnecessary calls to backstage api
    const urlParts = location.pathname.split('/');
    const relevantPath = `/${urlParts[1]}/${urlParts[2]}/${urlParts[3]}/${urlParts[4]}`;
    if (relevantPath !== previousRelevantPathRef.current) {
      previousRelevantPathRef.current = relevantPath;
      init();
    }

    // comment out hard reloading of the page when selecting a new page in the nav section.
    // imo not necessary, works fine without it
    // keep for now if error occurs, that hje was trying to catch with this
    //
    const handleLinkClick = (event: MouseEvent) => {
      // check if version is not latest
      if (version !== DEFAULT_VERSION) {
        (() => {
          // Traverse the composed path to find the anchor element within the Shadow DOM
          const path = event.composedPath();
          const anchorElement = path.find(element => {
            return element instanceof HTMLAnchorElement;
          }) as HTMLAnchorElement | undefined;

          // Check if an anchor element was found
          if (anchorElement && anchorElement.href) {
            // replace the edit url with the selected version before redirecting

            // select edit button
            if (
              anchorElement &&
              anchorElement.href &&
              anchorElement.classList.contains('md-content__button') &&
              anchorElement.title.includes('Edit this page')
            ) {
              event.preventDefault();
              let editURL = anchorElement.href;

              // don't allow editing of release versions
              // grey out the edit button when selected version is a release. Release is defined as a version that starts with 'v' and is followed by a number. Can be followed by a dot and minor and patch version.
              if (/^v(\d+(\.\d+){0,2})$/.test(version)) {
                anchorElement.style.pointerEvents = 'none';
                anchorElement.style.color = 'grey';
                anchorElement.title =
                  'This version is a release and cannot be edited.';
                anchorElement.style.cursor = 'not-allowed';
                alertApi.post({
                  message: 'This version is a release and cannot be edited.',
                  severity: 'warning',
                });
              } else {
                // replace edit url with the correct merge request branch
                if (/MR-\d+-/.test(version)) {
                  const branch = version.replace(/MR-\d+-/, '');

                  editURL = editURL.replace(
                    /(\/edit\/)[^\/]+\//,
                    `/edit/${branch}/`,
                  );
                  console.log(
                    'Remove merge request id from edit url: ',
                    editURL,
                  );
                }

                // replace the edit url with the selected version before redirecting when the edit url still contains main
                else if (editURL.includes('/edit/main/')) {
                  editURL = editURL.replace('/edit/main/', `/edit/${version}/`);
                  console.log(
                    'replacing edit url with selected version: ',
                    editURL,
                  );
                }

                window.open(editURL, '_blank');
              }
            }
            //  block to replace the page url with the selected version and hard reload the page evertime you click on a link in the nav or inside the page
            // check if url is of the same entity
            //  const urlBasicEntity = getBasicEntityFromUrl(anchorElement.href);
            //  if (urlBasicEntity.namespace !== basicEntity.namespace || urlBasicEntity.kind !== basicEntity.kind || urlBasicEntity.name !== basicEntity.name) {
            //      return;
            //  }
            //  event.preventDefault();
            //  // set new directory path to change to
            //  directoryPath = getDirectoryPath(new URL(anchorElement.href), rootUrl);
            //  changePage(version);
          }
        })();
      }
    };

    // Attach the event listener to the document
    document.addEventListener('click', handleLinkClick);

    // Cleanup: remove the event listener when the component is unmounted
    return () => {
      document.removeEventListener('click', handleLinkClick);
    };
  }, [location, alertApi]);

  return (
    <div className="versioning-container">
      <Icon className="versioning-icon">
        {renderedVersion !== DEFAULT_VERSION ? <WarningIcon /> : ''}
      </Icon>
      <h2 className="versioning-title">Version</h2>
      <Select
        id="version-select"
        value={renderedVersion}
        onChange={handleChange}
        aria-label="version-select"
      >
        {[...renderedVersions].map(version => (
          <MenuItem value={version} key={version}>
            {version}
          </MenuItem>
        ))}
      </Select>
    </div>
  );
};
