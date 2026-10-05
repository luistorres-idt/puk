import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { App, IgnoreStrategy } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { PukStagingApplicationStack } from './application-stack.js';
import { PukStagingFoundationStack } from './foundation-stack.js';

test('runs one bridge-mode ECS task on an IMDSv2-protected EC2 host', () => {
  const app = new App();
  const env = { account: '123456789012', region: 'us-east-2' };
  const foundation = new PukStagingFoundationStack(app, 'TestFoundation', { env });
  const stack = new PukStagingApplicationStack(app, 'TestApplication', { env, foundation });
  const template = Template.fromStack(stack);

  template.hasResourceProperties('AWS::ECS::Cluster', {
    ClusterSettings: [{ Name: 'containerInsights', Value: 'disabled' }],
  });
  template.hasResourceProperties('AWS::EC2::LaunchTemplate', {
    LaunchTemplateData: Match.objectLike({
      IamInstanceProfile: Match.anyValue(),
      InstanceType: 't3.small',
      MetadataOptions: Match.objectLike({
        HttpPutResponseHopLimit: 1,
        HttpTokens: 'required',
      }),
      NetworkInterfaces: Match.arrayWith([Match.objectLike({ AssociatePublicIpAddress: true })]),
    }),
  });
  template.hasResourceProperties('AWS::AutoScaling::AutoScalingGroup', {
    MaxSize: '1',
    MinSize: '1',
  });
  template.hasResourceProperties('AWS::ECS::CapacityProvider', {
    AutoScalingGroupProvider: { ManagedDraining: 'ENABLED' },
  });
  template.hasResourceProperties('AWS::ECS::TaskDefinition', {
    Cpu: '1024',
    Memory: '1792',
    NetworkMode: 'bridge',
    RequiresCompatibilities: ['EC2'],
    ContainerDefinitions: Match.arrayWith([
      Match.objectLike({
        Name: 'api',
        Environment: Match.arrayWith([{ Name: 'STORAGE_PROVIDER', Value: 'drive' }]),
        Secrets: Match.arrayWith([
          Match.objectLike({ Name: 'GOOGLE_DRIVE_CLIENT_EMAIL' }),
          Match.objectLike({ Name: 'GOOGLE_DRIVE_PRIVATE_KEY' }),
          Match.objectLike({ Name: 'GOOGLE_DRIVE_SHARED_DRIVE_ID' }),
        ]),
        PortMappings: [{ ContainerPort: 3000, HostPort: 3000, Protocol: 'tcp' }],
      }),
      Match.objectLike({
        Name: 'web',
        Links: ['api'],
        PortMappings: [{ ContainerPort: 80, HostPort: 80, Protocol: 'tcp' }],
      }),
    ]),
  });
  template.hasResourceProperties('AWS::ECS::TaskDefinition', {
    ContainerDefinitions: Match.arrayWith([
      Match.objectLike({
        Name: 'migration',
        Secrets: Match.arrayWith([
          Match.objectLike({ Name: 'SEED_ADMIN_EMAIL' }),
          Match.objectLike({ Name: 'SEED_ADMIN_PASSWORD' }),
          Match.objectLike({ Name: 'SEED_CLIENT_ADMIN_EMAIL' }),
          Match.objectLike({ Name: 'SEED_CLIENT_ADMIN_PASSWORD' }),
        ]),
      }),
    ]),
  });
  template.hasResourceProperties('AWS::ECS::Service', {
    DesiredCount: 1,
    DeploymentConfiguration: Match.objectLike({
      MaximumPercent: 100,
      MinimumHealthyPercent: 0,
    }),
    LaunchType: Match.absent(),
    NetworkConfiguration: Match.absent(),
  });
  template.resourceCountIs('AWS::ElasticLoadBalancingV2::LoadBalancer', 0);
  template.resourceCountIs('AWS::ElasticLoadBalancingV2::TargetGroup', 0);
  template.resourceCountIs('AWS::CloudFront::Distribution', 0);
  template.hasOutput('EcsHostAutoScalingGroupName', {});
  assert.equal(template.toJSON().Outputs.LegacyLoadBalancerSecurityGroupReference, undefined);
  assert.doesNotMatch(JSON.stringify(template.toJSON()), /LoadBalancerSecurityGroup/);
  template.resourceCountIs('AWS::EC2::EIP', 0);
  template.resourceCountIs('AWS::EC2::NatGateway', 0);
  template.resourceCountIs('AWS::S3::Bucket', 0);
  assert.doesNotMatch(JSON.stringify(template.toJSON()), /s3:(?:Get|Put|Delete|List)/i);
});

test('excludes local Google keys from Git and Docker assets without excluding package manifests', () => {
  const root = fileURLToPath(new URL('../../../', import.meta.url));
  const gitPatterns = readFileSync(join(root, '.gitignore'), 'utf8').split('\n');
  const dockerPatterns = readFileSync(join(root, '.dockerignore'), 'utf8').split('\n');
  const strategies = [
    IgnoreStrategy.git(root, gitPatterns),
    IgnoreStrategy.docker(root, dockerPatterns),
    IgnoreStrategy.glob(root, dockerPatterns),
  ];
  for (const strategy of strategies) {
    for (const name of ['puk-drive-text.json', 'puk-excel-test.json']) {
      assert.equal(strategy.ignores(join(root, name)), true);
    }
    for (const name of ['package.json', 'apps/api/package.json', 'infra/cdk/cdk.json']) {
      assert.equal(strategy.ignores(join(root, name)), false);
    }
  }
});
