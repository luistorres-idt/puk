import {
  CfnOutput,
  Duration,
  RemovalPolicy,
  Stack,
  type StackProps,
  aws_ec2 as ec2,
  aws_ecs as ecs,
  aws_iam as iam,
  aws_autoscaling as autoscaling,
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
      containerInsightsV2: ecs.ContainerInsights.DISABLED,
      vpc: foundation.vpc,
    });
    const ecsHostRole = new iam.Role(this, 'EcsHostRole', {
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
      description: 'Allows the ECS agent to register and communicate with ECS.',
    });
    ecsHostRole.addToPolicy(
      new iam.PolicyStatement({
        actions: [
          'ecs:DeregisterContainerInstance',
          'ecs:DiscoverPollEndpoint',
          'ecs:Poll',
          'ecs:RegisterContainerInstance',
          'ecs:StartTelemetrySession',
          'ecs:Submit*',
          'ecs:UpdateContainerInstancesState',
        ],
        resources: ['*'],
      }),
    );
    const ecsHostUserData = ec2.UserData.forLinux();
    ecsHostUserData.addCommands('echo ECS_CLUSTER=puk-staging >> /etc/ecs/ecs.config');
    const ecsHostLaunchTemplate = new ec2.LaunchTemplate(this, 'EcsHostLaunchTemplate', {
      associatePublicIpAddress: true,
      cpuCredits: ec2.CpuCredits.STANDARD,
      httpPutResponseHopLimit: 1,
      instanceType: new ec2.InstanceType('t3.small'),
      machineImage: ecs.EcsOptimizedImage.amazonLinux2023(ecs.AmiHardwareType.STANDARD),
      requireImdsv2: true,
      role: ecsHostRole,
      securityGroup: foundation.applicationSecurityGroup,
      userData: ecsHostUserData,
    });
    const ecsHostGroup = new autoscaling.AutoScalingGroup(this, 'EcsHostGroup', {
      launchTemplate: ecsHostLaunchTemplate,
      maxCapacity: 1,
      minCapacity: 1,
      vpc: foundation.vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
    });
    const ecsCapacityProvider = new ecs.AsgCapacityProvider(this, 'EcsCapacityProvider', {
      autoScalingGroup: ecsHostGroup,
      enableManagedDraining: true,
      enableManagedScaling: false,
      enableManagedTerminationProtection: false,
    });
    cluster.addAsgCapacityProvider(ecsCapacityProvider);
    const taskDefinition = new ecs.Ec2TaskDefinition(this, 'TaskDefinition', {
      networkMode: ecs.NetworkMode.BRIDGE,
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
      memoryLimitMiB: 512,
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
        SEED_CLIENT_ADMIN_EMAIL: ecs.Secret.fromSecretsManager(
          foundation.runtimeSecret,
          'SEED_CLIENT_ADMIN_EMAIL',
        ),
        SEED_CLIENT_ADMIN_PASSWORD: ecs.Secret.fromSecretsManager(
          foundation.runtimeSecret,
          'SEED_CLIENT_ADMIN_PASSWORD',
        ),
        SEED_TECHNICIAN_EMAIL: ecs.Secret.fromSecretsManager(
          foundation.runtimeSecret,
          'SEED_TECHNICIAN_EMAIL',
        ),
      },
    });

    const api = taskDefinition.addContainer('api', {
      environment: {
        ...databaseEnvironment,
        API_ORIGIN: 'http://localhost',
        APP_ORIGIN: 'http://localhost',
        CATALOG_CACHE_TTL_SECONDS: '60',
        CIRCUIT_BREAKER_ERROR_THRESHOLD: '50',
        CIRCUIT_BREAKER_RESET_TIMEOUT_MS: '30000',
        COOKIE_DOMAIN: '',
        COOKIE_SAME_SITE: 'lax',
        COOKIE_SECURE: 'false',
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
      memoryLimitMiB: 1024,
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
        GOOGLE_DRIVE_CLIENT_EMAIL: ecs.Secret.fromSecretsManager(
          foundation.runtimeSecret,
          'GOOGLE_DRIVE_CLIENT_EMAIL',
        ),
        GOOGLE_DRIVE_PRIVATE_KEY: ecs.Secret.fromSecretsManager(
          foundation.runtimeSecret,
          'GOOGLE_DRIVE_PRIVATE_KEY',
        ),
        GOOGLE_DRIVE_SHARED_DRIVE_ID: ecs.Secret.fromSecretsManager(
          foundation.runtimeSecret,
          'GOOGLE_DRIVE_SHARED_DRIVE_ID',
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
    api.addPortMappings({ containerPort: 3000, hostPort: 3000, protocol: ecs.Protocol.TCP });

    const web = taskDefinition.addContainer('web', {
      image: ecs.ContainerImage.fromAsset('../..', { file: 'infra/docker/web.Dockerfile' }),
      memoryLimitMiB: 256,
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
    web.addPortMappings({ containerPort: 80, hostPort: 80, protocol: ecs.Protocol.TCP });

    // CDK does not expose the ECS bridge-mode links field on ContainerDefinitionOptions.
    const cfnTaskDefinition = taskDefinition.node.defaultChild as ecs.CfnTaskDefinition;
    cfnTaskDefinition.addPropertyOverride('Cpu', '1024');
    cfnTaskDefinition.addPropertyOverride('Memory', '1792');
    cfnTaskDefinition.addPropertyOverride('ContainerDefinitions.2.Links', ['api']);

    new ecs.Ec2Service(this, 'Service', {
      circuitBreaker: { rollback: true },
      cluster,
      desiredCount: 1,
      capacityProviderStrategies: [
        { capacityProvider: ecsCapacityProvider.capacityProviderName, weight: 1 },
      ],
      healthCheckGracePeriod: Duration.seconds(120),
      maxHealthyPercent: 100,
      minHealthyPercent: 0,
      taskDefinition,
    });
    new CfnOutput(this, 'EcsHostAutoScalingGroupName', {
      value: ecsHostGroup.autoScalingGroupName,
    });
  }
}
