import { createPlugin } from '@backstage/core-plugin-api';
import {
  createTechDocsAddonExtension,
  TechDocsAddonLocations,
} from '@backstage/plugin-techdocs-react';
import { TechDocsVersioningComponent } from './TechDocsVersioning';

export const techdocsAddonVersioningPlugin = createPlugin({
  id: 'techdocs-addon-versioning',
});

export const TechDocsVersioning = techdocsAddonVersioningPlugin.provide(
  createTechDocsAddonExtension({
    name: 'VersionSelector',
    location: TechDocsAddonLocations.Subheader,
    component: TechDocsVersioningComponent,
  }),
);
