import { test } from 'node:test';
import { App } from 'aws-cdk-lib';
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
      InstanceType: 't3a.medium',
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
    Memory: '2048',
    NetworkMode: 'bridge',
    RequiresCompatibilities: ['EC2'],
    ContainerDefinitions: Match.arrayWith([
      Match.objectLike({
        Name: 'api',
        PortMappings: [{ ContainerPort: 3000, HostPort: 3000, Protocol: 'tcp' }],
      }),
      Match.objectLike({
        Name: 'web',
        Links: ['api'],
        PortMappings: [{ ContainerPort: 80, HostPort: 80, Protocol: 'tcp' }],
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
  template.resourceCountIs('AWS::EC2::EIP', 0);
  template.resourceCountIs('AWS::EC2::NatGateway', 0);
});
