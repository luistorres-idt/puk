import assert from 'node:assert/strict';
import { test } from 'node:test';
import { App } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { PukStagingFoundationStack } from './foundation-stack.js';

function foundationTemplate(context: Record<string, string> = {}): Template {
  const app = new App({ context });
  const stack = new PukStagingFoundationStack(app, 'TestFoundation', {
    env: { account: '123456789012', region: 'us-east-2' },
  });
  return Template.fromStack(stack);
}

function assertDeployTrust(template: Template, providerArn: unknown): void {
  template.hasResourceProperties('AWS::IAM::Role', {
    RoleName: 'puk-staging-github-deploy',
    AssumeRolePolicyDocument: Match.objectEquals({
      Version: '2012-10-17',
      Statement: [
        {
          Action: 'sts:AssumeRoleWithWebIdentity',
          Effect: 'Allow',
          Principal: { Federated: providerArn },
          Condition: {
            StringEquals: {
              'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
              'token.actions.githubusercontent.com:sub':
                'repo:luistorres-idt@231313402/puk@1357330027:ref:refs/heads/main',
            },
          },
        },
      ],
    }),
  });
  template.resourceCountIs('Custom::AWSCDKOpenIdConnectProvider', 0);
}

test('creates a native GitHub OIDC provider by default without thumbprints', () => {
  const template = foundationTemplate();
  template.resourceCountIs('AWS::IAM::OIDCProvider', 1);
  template.hasResourceProperties('AWS::IAM::OIDCProvider', {
    Url: 'https://token.actions.githubusercontent.com',
    ClientIdList: ['sts.amazonaws.com'],
    ThumbprintList: Match.absent(),
  });
  const [providerId] = Object.keys(template.findResources('AWS::IAM::OIDCProvider'));
  assert.ok(providerId);
  assertDeployTrust(template, { 'Fn::GetAtt': [providerId, 'Arn'] });
});

test('imports the explicit GitHub OIDC provider ARN without creating a provider', () => {
  const githubOidcProviderArn =
    'arn:aws:iam::210987654321:oidc-provider/token.actions.githubusercontent.com';
  const template = foundationTemplate({ githubOidcProviderArn });
  template.resourceCountIs('AWS::IAM::OIDCProvider', 0);
  assertDeployTrust(template, githubOidcProviderArn);
});
