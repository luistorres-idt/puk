# CDK Stack Constructs (`infra/cdk/lib/`)

Construct library defining the AWS staging stacks for Bull Dog Solution along with automated CloudFormation assertion test suites.

## Interface

| Construct / File                                           | Type      | Description                                                                                          |
| ---------------------------------------------------------- | --------- | ---------------------------------------------------------------------------------------------------- |
| [`PukStagingFoundationStack`](./foundation-stack.ts)       | CDK Stack | Foundational VPC, security groups, RDS PostgreSQL 17 Graviton instance, and GitHub OIDC deploy role. |
| [`PukStagingApplicationStack`](./application-stack.ts)     | CDK Stack | Single-host EC2 ECS cluster (`t3.small`), task definition, and bridge container network.             |
| [`foundation-stack.test.ts`](./foundation-stack.test.ts)   | Tests     | CloudFormation template assertions for network and database isolation.                               |
| [`application-stack.test.ts`](./application-stack.test.ts) | Tests     | CloudFormation template assertions for ECS container dependencies and host security.                 |

## Invariants

- **Zero Idle Cloud Surcharges**: 0 NAT Gateways, 0 ALBs, 0 CloudFront distributions, and 0 S3 buckets in current staging topology.
- **Database Isolation**: PostgreSQL 17 resides in private isolated subnets, accepting port 5432 ingress only from the application security group.
- **Container Dependency Order**: Bridge mode ECS task definition enforces strict startup: `migration` (exits `SUCCESS`) -> `api` (becomes `HEALTHY`) -> `web` (listens on host port 80).
- **Storage Delegation**: File operations delegate exclusively to Google Drive through authenticated API endpoints; no S3 buckets are provisioned.

## Side Effects

- CloudFormation assertions synthesize in-memory templates during Vitest runs without remote AWS mutations.

## Verification

```bash
pnpm infra:test
```
