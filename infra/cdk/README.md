# CDK Infrastructure Package (`infra/cdk/`)

Intermediate blueprint for AWS CDK v2 Infrastructure as Code, rolling up the CLI entrypoint and construct library for the staging environment.

## Subdirectories & Components

| Directory                 | Type                       | Description                                                                                      |
| ------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------ |
| [`bin/`](./bin/README.md) | Component Package (Peanut) | Application entrypoint (`puk.ts`) validating parameters and booting stacks.                      |
| [`lib/`](./lib/README.md) | Component Package (Peanut) | Construct definitions (`foundation-stack.ts`, `application-stack.ts`) and regression assertions. |

## Interface

| Command             | Type       | Description                                                  |
| ------------------- | ---------- | ------------------------------------------------------------ |
| `pnpm infra:synth`  | NPM Script | Synthesizes CloudFormation templates.                        |
| `pnpm infra:test`   | NPM Script | Executes CDK template assertion test suites.                 |
| `pnpm infra:diff`   | NPM Script | Compares local CDK state against deployed staging resources. |
| `pnpm infra:deploy` | NPM Script | Deploys staging foundation and application stacks.           |

## Invariants

- **Two-Stack Layering**: Staging infrastructure is divided into dependent stacks: `PukStagingFoundation` and `PukStagingApplication`.
- **Minimal Cloud Footprint**: Single-instance EC2 ECS design eliminates NAT Gateways and Application Load Balancers for staging.
- **Asset Sourcing**: CDK builds container assets directly from Dockerfiles in `../docker/`.

## Side Effects

- Synthesizes CloudFormation templates to `cdk.out/`.
- Provisions and modifies AWS resources when deployment commands are executed.

## Verification

```bash
pnpm infra:test
```
