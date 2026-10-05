import {
  CfnOutput,
  Duration,
  RemovalPolicy,
  Stack,
  type StackProps,
  aws_ec2 as ec2,
  aws_iam as iam,
  aws_rds as rds,
  aws_secretsmanager as secretsmanager,
} from 'aws-cdk-lib';
import type { Construct } from 'constructs';

export class PukStagingFoundationStack extends Stack {
  public readonly applicationSecurityGroup: ec2.SecurityGroup;
  public readonly database: rds.DatabaseInstance;
  public readonly runtimeSecret: secretsmanager.ISecret;
  public readonly vpc: ec2.Vpc;

  public constructor(scope: Construct, id: string, props: StackProps) {
    super(scope, id, props);

    this.vpc = new ec2.Vpc(this, 'Vpc', {
      ipAddresses: ec2.IpAddresses.cidr('10.42.0.0/16'),
      maxAzs: 2,
      natGateways: 0,
      subnetConfiguration: [
        { cidrMask: 24, name: 'public', subnetType: ec2.SubnetType.PUBLIC },
        {
          cidrMask: 24,
          name: 'application',
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
        },
        { cidrMask: 24, name: 'database', subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      ],
    });

    this.applicationSecurityGroup = new ec2.SecurityGroup(this, 'ApplicationSecurityGroup', {
      allowAllOutbound: true,
      description: 'Network access for the PUK staging ECS task',
      vpc: this.vpc,
    });
    this.applicationSecurityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(80),
      'Public HTTP traffic to the web container',
    );
    const databaseSecurityGroup = new ec2.SecurityGroup(this, 'DatabaseSecurityGroup', {
      allowAllOutbound: false,
      description: 'PostgreSQL access from the PUK staging application only',
      vpc: this.vpc,
    });
    databaseSecurityGroup.addIngressRule(
      this.applicationSecurityGroup,
      ec2.Port.tcp(5432),
      'PostgreSQL from ECS',
    );

    this.database = new rds.DatabaseInstance(this, 'Database', {
      allocatedStorage: 20,
      // Free Tier accounts support at most one day of automated backups.
      backupRetention: Duration.days(1),
      credentials: rds.Credentials.fromGeneratedSecret('puk'),
      databaseName: 'puk',
      deletionProtection: true,
      engine: rds.DatabaseInstanceEngine.postgres({
        version: rds.PostgresEngineVersion.VER_17,
      }),
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.BURSTABLE4_GRAVITON,
        ec2.InstanceSize.MICRO,
      ),
      maxAllocatedStorage: 100,
      multiAz: false,
      publiclyAccessible: false,
      removalPolicy: RemovalPolicy.RETAIN,
      securityGroups: [databaseSecurityGroup],
      storageEncrypted: true,
      vpc: this.vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
    });

    this.runtimeSecret = secretsmanager.Secret.fromSecretNameV2(
      this,
      'RuntimeSecret',
      'puk/staging/runtime',
    );

    const githubOidcProviderArn = this.node.tryGetContext('githubOidcProviderArn') as
      string | undefined;
    const githubProviderArn = githubOidcProviderArn
      ? iam.OpenIdConnectProvider.fromOpenIdConnectProviderArn(
          this,
          'GitHubProvider',
          githubOidcProviderArn,
        ).openIdConnectProviderArn
      : new iam.CfnOIDCProvider(this, 'GitHubProvider', {
          url: 'https://token.actions.githubusercontent.com',
          clientIdList: ['sts.amazonaws.com'],
        }).attrArn;
    const deployRole = new iam.Role(this, 'GitHubDeployRole', {
      assumedBy: new iam.WebIdentityPrincipal(githubProviderArn, {
        StringEquals: {
          'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
          // GitHub uses immutable OIDC subjects for this repository.
          // Keep the owner and repository IDs in the trust policy so renames
          // or namespace recycling cannot grant access to another repository.
          'token.actions.githubusercontent.com:sub':
            'repo:luistorres-idt@231313402/puk@1357330027:ref:refs/heads/main',
        },
      }),
      description: 'CDK deployments from the puk main branch',
      roleName: 'puk-staging-github-deploy',
    });
    deployRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ['cloudformation:DescribeStacks'],
        resources: ['*'],
      }),
    );
    deployRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ['autoscaling:DescribeAutoScalingGroups', 'ec2:DescribeInstances'],
        resources: ['*'],
      }),
    );
    deployRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ['sts:AssumeRole'],
        resources: [`arn:aws:iam::${this.account}:role/cdk-*`],
      }),
    );

    new CfnOutput(this, 'GitHubDeployRoleArn', { value: deployRole.roleArn });
    new CfnOutput(this, 'RuntimeSecretName', { value: this.runtimeSecret.secretName });
  }
}
