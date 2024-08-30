import {
  coreServices,
  createBackendModule,
  LoggerService,
  RootConfigService,
} from '@backstage/backend-plugin-api';
import { S3Client, GetObjectCommand, S3ClientConfig } from '@aws-sdk/client-s3';
import { Entity } from '@backstage/catalog-model';
import {
  DocsBuildStrategy,
  techdocsBuildsExtensionPoint,
} from '@backstage/plugin-techdocs-node';

export class TechDocsBuildStrategy implements DocsBuildStrategy {
  private readonly config: RootConfigService;
  private readonly s3Client: S3Client;
  private readonly logger: LoggerService;

  constructor(config: RootConfigService, logger: LoggerService) {
    this.config = config;
    this.logger = logger;
    this.s3Client = new S3Client({
      region: this.config.get('techdocs.publisher.awsS3.region'),
      credentials: {
        accessKeyId: this.config.get(
          'techdocs.publisher.awsS3.credentials.accessKeyId',
        ),
        secretAccessKey: this.config.get(
          'techdocs.publisher.awsS3.credentials.secretAccessKey',
        ),
      },
      endpoint: this.config.get('techdocs.publisher.awsS3.endpoint'),
      forcePathStyle: true, // needed with minio to set the bucket name as a path instead of a subdomain to avoid SSL issues
    } as S3ClientConfig);
  }

  /**
   * Checks whether the entity should be built locally if no index.html can be found in the S3 bucket for the current entity.
   *
   * @param params.entity The entity to check
   * @returns A boolean indicating whether the entity should be built locally
   */
  async shouldBuild(params: { entity: Entity }): Promise<boolean> {
    const entityKey = `${params.entity.metadata.namespace}/${params.entity.kind}/${params.entity.metadata.name}/versions.json`;

    return new Promise<boolean>(resolve => {
      this.s3Client
        .send(
          new GetObjectCommand({
            Bucket: this.config.get('techdocs.publisher.awsS3.bucketName'),
            Key: entityKey.toLowerCase(),
          }),
        )
        .then(() => {
          this.logger.info(
            `Entity ${params.entity.metadata.name} exists in S3. Loading the docs from S3...`,
          );
          resolve(false);
        })
        .catch((err: Error) => {
          this.logger.info(
            `Entity ${params.entity.metadata.name} does not exist in S3. Rebuilding the docs locally...`,
          );
          this.logger.debug(
            `Error loading entity ${params.entity.metadata.name} from S3: ${err}`,
          );
          resolve(true);
        });
    });
  }
}

export const techdocsModuleVersions = createBackendModule({
  pluginId: 'techdocs',
  moduleId: 'versioning',
  register(reg) {
    reg.registerInit({
      deps: {
        logger: coreServices.logger,
        config: coreServices.rootConfig,
        techdocs: techdocsBuildsExtensionPoint,
      },
      async init({ logger, config, techdocs }) {
        const techDocsBuildStrategy = new TechDocsBuildStrategy(config, logger);
        techdocs.setBuildStrategy(techDocsBuildStrategy);
      },
    });
  },
});
