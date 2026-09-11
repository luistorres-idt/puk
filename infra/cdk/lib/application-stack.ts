import {
  CfnOutput,
  Duration,
  RemovalPolicy,
  Stack,
  type StackProps,
  aws_ec2 as ec2,
  aws_cloudfront as cloudfront,
  aws_cloudfront_origins as origins,
  aws_ecs as ecs,
  aws_elasticloadbalancingv2 as elbv2,
  aws_logs as logs,
} from 'aws-cdk-lib';
import type { Construct } from 'constructs';

import type { PukStagingFoundationStack } from './foundation-stack.js';

interface ApplicationStackProps extends StackProps {
  foundation: PukStagingFoundationStack;
}

export class PukStagingApplicationStack extends Stack {
  public constructor(scope: Construct, id: string, props: ApplicationStackProps) {
    super(scope, id, props);

    const { foundation } = props;
    const cluster = new ecs.Cluster(this, 'Cluster', {
      clusterName: 'puk-staging',
      containerInsightsV2: ecs.ContainerInsights.ENABLED,
      vpc: foundation.vpc,
    });
    const loadBalancer = new elbv2.ApplicationLoadBalancer(this, 'LoadBalancer', {
      internetFacing: true,
      securityGroup: foundation.loadBalancerSecurityGroup,
      vpc: foundation.vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
    });
    const originVerifyHeaderName = 'X-Origin-Verify';
    const originVerifyHeaderValue = `puk-staging-${this.account}-${this.region}-origin-verify`;

    const webTargetGroup = new elbv2.ApplicationTargetGroup(this, 'WebTargetGroup', {
      deregistrationDelay: Duration.seconds(15),
      healthCheck: {
        healthyHttpCodes: '200',
        healthyThresholdCount: 2,
        interval: Duration.seconds(15),
        path: '/',
        timeout: Duration.seconds(5),
        unhealthyThresholdCount: 3,
      },
      port: 80,
      protocol: elbv2.ApplicationProtocol.HTTP,
      targetType: elbv2.TargetType.IP,
      vpc: foundation.vpc,
    });
    const apiTargetGroup = new elbv2.ApplicationTargetGroup(this, 'ApiTargetGroup', {
      deregistrationDelay: Duration.seconds(15),
      healthCheck: {
        healthyHttpCodes: '200',
        healthyThresholdCount: 2,
        interval: Duration.seconds(15),
        path: '/health/ready',
        timeout: Duration.seconds(5),
        unhealthyThresholdCount: 3,
      },
      port: 3000,
      protocol: elbv2.ApplicationProtocol.HTTP,
      targetType: elbv2.TargetType.IP,
      vpc: foundation.vpc,
    });
    const listener = loadBalancer.addListener('HttpListener', {
      defaultAction: elbv2.ListenerAction.fixedResponse(403, {
        contentType: 'text/plain',
        messageBody: 'Access denied: Requests must originate from CloudFront.',
      }),
      port: 80,
    });
    listener.addAction('ApiRoutes', {
      action: elbv2.ListenerAction.forward([apiTargetGroup]),
      conditions: [
        elbv2.ListenerCondition.httpHeader(originVerifyHeaderName, [originVerifyHeaderValue]),
        elbv2.ListenerCondition.pathPatterns(['/api*', '/health*', '/metrics', '/docs*']),
      ],
      priority: 10,
    });
    listener.addAction('WebRoutes', {
      action: elbv2.ListenerAction.forward([webTargetGroup]),
      conditions: [
        elbv2.ListenerCondition.httpHeader(originVerifyHeaderName, [originVerifyHeaderValue]),
      ],
      priority: 20,
    });

    const taskDefinition = new ecs.FargateTaskDefinition(this, 'TaskDefinition', {
      cpu: 1024,
      memoryLimitMiB: 2048,
    });
    const databaseEnvironment = {
      PUK_DATABASE_HOST: foundation.database.dbInstanceEndpointAddress,
      PUK_DATABASE_NAME: 'puk',
      PUK_DATABASE_PORT: foundation.database.dbInstanceEndpointPort,
      PUK_DATABASE_SSL_MODE: 'no-verify',
    };
    const databaseSecrets = {
      PUK_DATABASE_PASSWORD: ecs.Secret.fromSecretsManager(foundation.database.secret!, 'password'),
      PUK_DATABASE_USER: ecs.Secret.fromSecretsManager(foundation.database.secret!, 'username'),
    };
    const migration = taskDefinition.addContainer('migration', {
      command: [
        '/bin/sh',
        '-c',
        'cd apps/api && pnpm exec prisma migrate deploy --config ../../prisma.config.ts && pnpm exec tsx ../../prisma/seed.ts',
      ],
      environment: databaseEnvironment,
      essential: false,
      image: ecs.ContainerImage.fromAsset('../..', {
        file: 'infra/docker/migrate.Dockerfile',
      }),
      logging: ecs.LogDrivers.awsLogs({
        logGroup: new logs.LogGroup(this, 'MigrationLogs', {
          logGroupName: '/puk/staging/migration',
          removalPolicy: RemovalPolicy.RETAIN,
          retention: logs.RetentionDays.ONE_MONTH,
        }),
        streamPrefix: 'migration',
      }),
      secrets: {
        ...databaseSecrets,
        SEED_ADMIN_EMAIL: ecs.Secret.fromSecretsManager(
          foundation.runtimeSecret,
          'SEED_ADMIN_EMAIL',
        ),
        SEED_ADMIN_PASSWORD: ecs.Secret.fromSecretsManager(
          foundation.runtimeSecret,
          'SEED_ADMIN_PASSWORD',
        ),
        SEED_TECHNICIAN_EMAIL: ecs.Secret.fromSecretsManager(
          foundation.runtimeSecret,
          'SEED_TECHNICIAN_EMAIL',
        ),
      },
    });

    const albOrigin = new origins.LoadBalancerV2Origin(loadBalancer, {
      customHeaders: {
        [originVerifyHeaderName]: originVerifyHeaderValue,
      },
      protocolPolicy: cloudfront.OriginProtocolPolicy.HTTP_ONLY,
    });

    const distribution = new cloudfront.Distribution(this, 'Distribution', {
      additionalBehaviors: {
        '/api/*': {
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          compress: true,
          origin: albOrigin,
          originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
          responseHeadersPolicy: cloudfront.ResponseHeadersPolicy.SECURITY_HEADERS,
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        },
        '/assets/*': {
          allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD,
          cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
          compress: true,
          origin: albOrigin,
          responseHeadersPolicy: cloudfront.ResponseHeadersPolicy.SECURITY_HEADERS,
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        },
        '/docs*': {
          allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          compress: true,
          origin: albOrigin,
          originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
          responseHeadersPolicy: cloudfront.ResponseHeadersPolicy.SECURITY_HEADERS,
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        },
        '/health/*': {
          allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          compress: true,
          origin: albOrigin,
          originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
          responseHeadersPolicy: cloudfront.ResponseHeadersPolicy.SECURITY_HEADERS,
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        },
        '/metrics': {
          allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          compress: true,
          origin: albOrigin,
          originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
          responseHeadersPolicy: cloudfront.ResponseHeadersPolicy.SECURITY_HEADERS,
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        },
      },
      comment: 'Bull Dog Solution - Staging Distribution',
      defaultBehavior: {
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
        cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
        compress: true,
        origin: albOrigin,
        originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
        responseHeadersPolicy: cloudfront.ResponseHeadersPolicy.SECURITY_HEADERS,
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      },
      enabled: true,
      httpVersion: cloudfront.HttpVersion.HTTP2_AND_3,
    });
    const publicOrigin = `https://${distribution.distributionDomainName}`;
    const api = taskDefinition.addContainer('api', {
      environment: {
        ...databaseEnvironment,
        API_ORIGIN: publicOrigin,
        APP_ORIGIN: publicOrigin,
        CATALOG_CACHE_TTL_SECONDS: '60',
        CIRCUIT_BREAKER_ERROR_THRESHOLD: '50',
        CIRCUIT_BREAKER_RESET_TIMEOUT_MS: '30000',
        COOKIE_DOMAIN: '',
        COOKIE_SAME_SITE: 'lax',
        COOKIE_SECURE: 'true',
        GOOGLE_CLIENTS_SHEET: 'Clientes',
        GOOGLE_EQUIPMENT_SHEET: 'SALIDAS',
        JWT_ACCESS_TTL: '15m',
        JWT_AUDIENCE: 'puk-web',
        JWT_ISSUER: 'puk-api',
        JWT_REFRESH_TTL: '30d',
        LOG_LEVEL: 'info',
        MAX_EVIDENCE_BYTES: '10485760',
        MAX_SIGNATURE_BYTES: '1048576',
        MIN_PASSWORD_LENGTH: '12',
        NODE_ENV: 'production',
        OUTBOX_POLL_INTERVAL_MS: '5000',
        PORT: '3000',
        PRESIGNED_URL_TTL_SECONDS: '300',
        S3_BUCKET: foundation.bucket.bucketName,
        S3_ENDPOINT: `https://s3.${this.region}.amazonaws.com`,
        S3_FORCE_PATH_STYLE: 'false',
        S3_REGION: this.region,
        SHEETS_RETRY_LIMIT: '3',
        SHEETS_TIMEOUT_MS: '5000',
        TECHNICAL_REPORT_CUTOFF_WEEKDAY: '2',
        TECHNICAL_REPORT_SYNC_TIME: '17:00',
        TECHNICAL_REPORT_SYNC_TIMEZONE: 'America/Hermosillo',
        TECHNICAL_REPORT_SYNC_WEEKDAY: '3',
        TRUST_PROXY: 'true',
      },
      healthCheck: {
        command: [
          'CMD-SHELL',
          'node -e "fetch(\'http://127.0.0.1:3000/health/live\').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"',
        ],
        interval: Duration.seconds(30),
        retries: 3,
        startPeriod: Duration.seconds(60),
        timeout: Duration.seconds(5),
      },
      image: ecs.ContainerImage.fromAsset('../..', { file: 'infra/docker/api.Dockerfile' }),
      logging: ecs.LogDrivers.awsLogs({
        logGroup: new logs.LogGroup(this, 'ApiLogs', {
          logGroupName: '/puk/staging/api',
          removalPolicy: RemovalPolicy.RETAIN,
          retention: logs.RetentionDays.ONE_MONTH,
        }),
        streamPrefix: 'api',
      }),
      secrets: {
        ...databaseSecrets,
        GOOGLE_CLIENT_EMAIL: ecs.Secret.fromSecretsManager(
          foundation.runtimeSecret,
          'GOOGLE_CLIENT_EMAIL',
        ),
        GOOGLE_PRIVATE_KEY: ecs.Secret.fromSecretsManager(
          foundation.runtimeSecret,
          'GOOGLE_PRIVATE_KEY',
        ),
        GOOGLE_SPREADSHEET_ID: ecs.Secret.fromSecretsManager(
          foundation.runtimeSecret,
          'GOOGLE_SPREADSHEET_ID',
        ),
        GOOGLE_TECHNICIANS_SPREADSHEET_ID: ecs.Secret.fromSecretsManager(
          foundation.runtimeSecret,
          'GOOGLE_TECHNICIANS_SPREADSHEET_ID',
        ),
        JWT_ACCESS_PRIVATE_KEY: ecs.Secret.fromSecretsManager(
          foundation.runtimeSecret,
          'JWT_ACCESS_PRIVATE_KEY',
        ),
        JWT_ACCESS_PUBLIC_KEY: ecs.Secret.fromSecretsManager(
          foundation.runtimeSecret,
          'JWT_ACCESS_PUBLIC_KEY',
        ),
        JWT_REFRESH_PRIVATE_KEY: ecs.Secret.fromSecretsManager(
          foundation.runtimeSecret,
          'JWT_REFRESH_PRIVATE_KEY',
        ),
        JWT_REFRESH_PUBLIC_KEY: ecs.Secret.fromSecretsManager(
          foundation.runtimeSecret,
          'JWT_REFRESH_PUBLIC_KEY',
        ),
      },
    });
    api.addContainerDependencies({
      condition: ecs.ContainerDependencyCondition.SUCCESS,
      container: migration,
    });
    api.addPortMappings({ containerPort: 3000, protocol: ecs.Protocol.TCP });

    const web = taskDefinition.addContainer('web', {
      image: ecs.ContainerImage.fromAsset('../..', { file: 'infra/docker/web.Dockerfile' }),
      logging: ecs.LogDrivers.awsLogs({
        logGroup: new logs.LogGroup(this, 'WebLogs', {
          logGroupName: '/puk/staging/web',
          removalPolicy: RemovalPolicy.RETAIN,
          retention: logs.RetentionDays.ONE_MONTH,
        }),
        streamPrefix: 'web',
      }),
    });
    web.addContainerDependencies({
      condition: ecs.ContainerDependencyCondition.HEALTHY,
      container: api,
    });
    web.addPortMappings({ containerPort: 80, protocol: ecs.Protocol.TCP });

    foundation.bucket.grantReadWrite(taskDefinition.taskRole);
    const service = new ecs.FargateService(this, 'Service', {
      assignPublicIp: false,
      circuitBreaker: { rollback: true },
      cluster,
      desiredCount: 1,
      healthCheckGracePeriod: Duration.seconds(120),
      maxHealthyPercent: 200,
      minHealthyPercent: 100,
      securityGroups: [foundation.applicationSecurityGroup],
      taskDefinition,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
    });
    webTargetGroup.addTarget(
      service.loadBalancerTarget({ containerName: web.containerName, containerPort: 80 }),
    );
    apiTargetGroup.addTarget(
      service.loadBalancerTarget({ containerName: api.containerName, containerPort: 3000 }),
    );

    new CfnOutput(this, 'StagingUrl', { value: publicOrigin });
  }
}
