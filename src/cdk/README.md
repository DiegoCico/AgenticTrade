# Agentictrade CDK Infrastructure

AWS Cloud Development Kit (CDK) infrastructure as code for deploying the Agentictrade platform.

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           AWS Region                                    │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                    VPC (Optional)                            │    │
│  │  ┌─────────────────────────────────────────────────────┐    │    │
│  │  │                   Lambda Functions                   │    │    │
│  │  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐   │    │    │
│  │  │  │  Auth   │ │   API   │ │  Sync   │ │  Cron   │   │    │    │
│  │  │  └────┬────┘ └────┬────┘ └────┬────┘ └────┬────┘   │    │    │
│  │  │       └────────────┼───────────┼───────────┘          │    │    │
│  │  └──────────────────┼───────────┼────────────────────┘    │    │
│  │                     ▼           ▼                           │    │
│  │  ┌─────────────────────────────────────────────────────┐    │    │
│  │  │               API Gateway REST API                  │    │    │
│  │  └─────────────────────┬───────────────────────────────┘    │    │
│  └───────────────────────┬─────────────────────────────────────┘    │
│                          ▼                                          │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │                    DynamoDB Tables                          │  │
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────────────┐    │  │
│  │  │   Users     │ │ Transactions│ │     Categories     │    │  │
│  │  │  (GSI: email)│ │            │ │                     │    │  │
│  │  └─────────────┘ └─────────────┘ └─────────────────────┘    │  │
│  │  ┌─────────────┐ ┌─────────────┐                           │  │
│  │  │   Budgets   │ │   Plans    │                           │  │
│  │  └─────────────┘ └─────────────┘                           │  │
│  └─────────────────────────────────────────────────────────────┘  │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │                   Cognito User Pool                        │  │
│  │  ┌─────────────────────────────────────────────────────┐  │  │
│  │  │  • Email verification                               │  │  │
│  │  │  • Password policies                                │  │  │
│  │  │  • OAuth 2.0 scopes                                │  │  │
│  │  │  • Custom attributes                                │  │  │
│  │  └─────────────────────────────────────────────────────┘  │  │
│  └─────────────────────────────────────────────────────────────┘  │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │                   S3 + CloudFront                          │  │
│  │  ┌─────────────┐    ┌─────────────────────────────────┐  │  │
│  │  │  Frontend   │───►│     CloudFront Distribution     │  │  │
│  │  │  Bucket     │    │     (CDN + SSL/TLS)            │  │  │
│  │  └─────────────┘    └─────────────────────────────────┘  │  │
│  └─────────────────────────────────────────────────────────────┘  │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

## 📁 Directory Structure

```
src/cdk/
├── bin/
│   └── app.ts              # CDK application entry point
│
├── lib/
│   ├── api-stack.ts        # API Gateway + Lambda stack
│   ├── cognito-stack.ts    # Cognito User Pool stack
│   ├── dynamo-stack.ts      # DynamoDB tables stack
│   ├── web-stack.ts        # S3 + CloudFront stack
│   ├── dns-stack.ts        # Route53 DNS stack
│   └── ses-stack.ts        # SES email stack
│
├── src/
│   ├── handler.ts          # Lambda function code
│   └── process.ts         # Lambda environment config
│
├── scripts/
│   └── deploy.sh          # Deployment script
│
├── cdk.json               # CDK configuration
├── stage.ts              # Stage definition
├── package.json         # Dependencies
└── tsconfig.json        # TypeScript config
```

## 🚀 Getting Started

### Prerequisites

- AWS CLI configured with credentials
- Node.js 18+
- CDK v2 installed globally

```bash
npm install -g aws-cdk@2
```

### Installation

```bash
cd src/cdk
npm install
```

### Bootstrap CDK

First time deployment requires CDK bootstrap:

```bash
cdk bootstrap
```

Or with specific account/region:

```bash
cdk bootstrap aws://ACCOUNT-ID/REGION
```

## 🚀 Deployment

### Deploy All Stacks

```bash
# Deploy to development
npm run deploy

# Deploy with diff (dry run)
cdk diff

# Deploy to specific stage
cdk deploy --profile production
```

### Deploy Individual Stacks

```bash
# Deploy DynamoDB tables
cdk deploy AgentictradeDynamo-dev

# Deploy Cognito
cdk deploy AgentictradeCognito-dev

# Deploy API
cdk deploy AgentictradeApi-dev

# Deploy Web (frontend)
cdk deploy AgentictradeWeb-dev
```

### Destroy Stacks

```bash
# Destroy all
cdk destroy

# Destroy specific stack
cdk destroy AgentictradeDynamo-dev
```

## 📦 Stacks

### DynamoDB Stack (`dynamo-stack.ts`)

Creates all DynamoDB tables with GSIs:

| Table | Primary Key | GSI | Description |
|-------|-------------|-----|-------------|
| Users | PK: USER#{userId}, SK: METADATA | EmailIndex (email → userId) | User profiles |
| Transactions | PK: USER#{userId}, SK: TRANSACTION#{id} | - | Transaction data |
| Categories | PK: USER#{userId}, SK: CATEGORY#{id} | - | User categories |
| Budgets | PK: USER#{userId}, SK: BUDGET#{id} | - | Budget data |
| Plans | PK: USER#{userId}, SK: PLAN#{id} | - | Savings plans |
| Investments | PK: USER#{userId}, SK: INVESTMENT#{id} | - | Investment data |

### Cognito Stack (`cognito-stack.ts`)

Creates Cognito User Pool with:

- Email verification
- Password policy (min 8 chars, requires numbers)
- Custom attributes:
  - `given_name`
  - `family_name`
- App client for API access

### API Stack (`api-stack.ts`)

Creates:

- **API Gateway REST API** - Main API entry point
- **Lambda Functions**:
  - `AgentictradeApiFunction` - Main API handler
  - `AgentictradeCronFunction` - Scheduled tasks
- **IAM Roles** - Execution permissions
- **Environment Variables**:
  - `TABLE_NAME` - DynamoDB table name
  - `USER_POOL_ID` - Cognito pool ID
  - `CLIENT_ID` - Cognito client ID
  - `REGION` - AWS region

### Web Stack (`web-stack.ts`)

Creates:

- **S3 Bucket** - Static website hosting
- **CloudFront Distribution** - CDN with SSL
- **Origin Access Identity** - Secure bucket access

### DNS Stack (`dns-stack.ts`)

Optional Route53 integration:

- Hosted zone lookup
- A records for CloudFront
- AAAA records (IPv6)

## 🔧 Configuration

### Stage Configuration (`stage.ts`)

```typescript
export class AgentictradeStage extends Stage {
  constructor(parent: App, id: string, props: StageProps) {
    super(parent, id, {
      env: {
        account: props.account || process.env.CDK_DEFAULT_ACCOUNT,
        region: props.region || process.env.CDK_DEFAULT_REGION || 'us-east-1',
      },
      tags: {
        project: 'agentictrade',
        stage: id,
      },
    });

    new AgentictradeStack(this, 'Agentictrade', { stage: id });
  }
}
```

### Context Variables

```bash
# Set stage name
cdk deploy -c stage=production

# Set domain name
cdk deploy -c domainName=api.agentictrade.app
```

## 📝 CDK Commands

```bash
# List all stacks
cdk list

# Show diff before deploy
cdk diff

# Synthesize to CloudFormation
cdk synth

# Deploy with changes
cdk deploy --require-approval never

# View logs
cdk logs

# Check for security issues
cdk doctor
```

## 🔐 IAM Permissions

Required IAM permissions for deployment:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "cloudformation:*",
        "s3:*",
        "dynamodb:*",
        "lambda:*",
        "apigateway:*",
        "cognito-idp:*",
        "cloudfront:*",
        "route53:*",
        "iam:*"
      ],
      "Resource": "*"
    }
  ]
}
```

## 🏗️ Lambda Function

The main Lambda handler (`src/handler.ts`) handles all API requests:

```typescript
import { lambdaHandler } from './server';

export const handler = lambdaHandler;
```

Environment variables are loaded from `src/process.ts`:

```typescript
export const config = {
  REGION: process.env.REGION || 'us-east-1',
  TABLE_NAME: process.env.TABLE_NAME || 'agentictrade-users',
  USER_POOL_ID: process.env.USER_POOL_ID,
  CLIENT_ID: process.env.CLIENT_ID,
  DEMO_MODE: process.env.DEMO_MODE === 'true',
};
```

## 📊 Monitoring

### CloudWatch Logs

All Lambda functions log to CloudWatch:

```bash
# View logs for API function
aws logs tail /aws/lambda/AgentictradeApiFunction --follow
```

### X-Ray Tracing

Enable X-Ray for distributed tracing:

```typescript
// In api-stack.ts
apiFunction.addTracing(Tracing.ENABLED);
```

## 🔄 CI/CD Pipeline

### GitHub Actions

Deploy on push to main:

```yaml
name: Deploy
on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: 18
      - run: cd src/cdk && npm install && npm run deploy
        env:
          AWS_ACCESS_KEY_ID: ${{ secrets.AWS_ACCESS_KEY_ID }}
          AWS_SECRET_ACCESS_KEY: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
```

## 📦 Dependencies

```json
{
  "dependencies": {
    "aws-cdk-lib": "^2.0.0",
    "aws-lambda": "^1.0.0",
    "@aws-sdk/client-dynamodb": "^3.0.0",
    "@aws-sdk/lib-dynamodb": "^3.0.0",
    "zod": "^3.0.0",
    "trpc-server": "^10.0.0"
  },
  "devDependencies": {
    "aws-cdk": "^2.0.0",
    "typescript": "^5.0.0"
  }
}
```

## 🧪 Testing

### CDK Assertions

```typescript
import { Template } from 'aws-cdk-lib/assertions';
import { Stack } from 'aws-cdk-lib';

test('S3 bucket created', () => {
  const stack = new Stack();
  // ... add resources ...
  
  const template = Template.fromStack(stack);
  template.hasResourceProperties('AWS::S3::Bucket', {
    BucketName: 'agentictrade-frontend',
  });
});
```

## 📝 Notes

### First Deployment

1. Bootstrap CDK in your account
2. Deploy `AgentictradeDynamo-dev` first (tables needed for API)
3. Deploy `AgentictradeCognito-dev`
4. Deploy `AgentictradeApi-dev`
5. Deploy `AgentictradeWeb-dev`

### Database Cleanup

⚠️ **Warning**: Deleting DynamoDB stacks will **permanently delete all data**. Ensure backups before destroying stacks.

### Cost Optimization

- Use DynamoDB on-demand capacity for development
- Enable auto-scaling for production
- Use CloudFront price classes for cost control

## 🐛 Troubleshooting

### Bootstrap Errors

```bash
# Re-bootstrap with additional permissions
cdk bootstrap --cloudformation-execution-policies arn:aws:iam::aws:policy/AdministratorAccess
```

### Permission Errors

```bash
# Verify AWS credentials
aws sts get-caller-identity
```

### Stack Update Failures

```bash
# Check CloudFormation events
aws cloudformation describe-stack-events --stack-name AgentictradeDynamo-dev
```
