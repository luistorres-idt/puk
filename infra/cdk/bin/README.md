# CDK Application Entrypoint (`infra/cdk/bin/`)

AWS CDK staging application entrypoint that validates account and region parameters before instantiating the foundation and application stacks.

## Interface

| File / Command       | Type        | Description                                                                    |
| -------------------- | ----------- | ------------------------------------------------------------------------------ |
| [`puk.ts`](./puk.ts) | Entrypoint  | TypeScript CDK app definition instantiating foundation and application stacks. |
| `pnpm infra:synth`   | CLI Command | Synthesizes CloudFormation templates from entrypoint.                          |

### Environment Parameters

- `AWS_ACCOUNT_ID`: 12-digit AWS account identifier (`^\d{12}$`).
- `AWS_REGION`: Valid AWS region identifier (`^[a-z]{2}(?:-[a-z0-9]+)+-\d$`).
- `STAGING_RUNTIME_SECRET_ID`: Secrets Manager secret ID (defaults to `puk/staging/runtime`).
- `AWS_DEPLOY_ROLE_NAME`: GitHub Actions IAM deployment role name (defaults to `puk-staging-github-deploy`).

## Invariants

- **Strict Input Validation**: Enforces 12-digit AWS account ID and AWS region format at initialization before CloudFormation synthesis.
- **Stack Composition**: `PukStagingApplicationStack` strictly depends on construct references passed from `PukStagingFoundationStack`.
- **Target Boundary**: Defines staging infrastructure only; no production stacks are declared here.

## Side Effects

- Emits synthesized CloudFormation template artifacts to `cdk.out/` when invoked by CDK CLI.

## Verification

```bash
pnpm infra:synth
```
