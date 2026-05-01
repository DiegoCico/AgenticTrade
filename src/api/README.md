# Agentictrade API

TypeScript-based backend API using TRPC, DynamoDB, and AWS Lambda.

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     API Gateway                              │
│              (TRPC Router → Lambda Handler)                │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                     Lambda Handler                          │
│                   (src/handler.ts)                          │
└─────────────────────────┬───────────────────────────────────┘
                          │
          ┌───────────────┼───────────────┐
          ▼               ▼               ▼
    ┌──────────┐   ┌──────────┐   ┌──────────┐
    │ DynamoDB │   │ Cognito  │   │  S3      │
    │ (Data)   │   │ (Auth)   │   │ (Files)  │
    └──────────┘   └──────────┘   └──────────┘
```

## 📁 Directory Structure

```
src/api/
├── __tests__/              # Jest test files
│   ├── auth.test.ts        # Authentication tests
│   ├── categories.test.ts  # Category tests
│   ├── transactions.test.ts # Transaction tests
│   ├── budgets.test.ts     # Budget tests
│   ├── dashboard.test.ts   # Dashboard tests
│   ├── investments.test.ts  # Investment tests
│   ├── planner.test.ts     # Planner tests
│   ├── routers.test.ts      # Router export tests
│   ├── categories.integration.test.ts # Integration tests
│   └── jest.setup.ts        # Jest configuration
│
├── src/
│   ├── routers/            # TRPC route handlers
│   │   ├── auth.ts        # Authentication endpoints
│   │   ├── transactions.ts # Transaction management
│   │   ├── categories.ts   # Category management
│   │   ├── budgets.ts      # Budget management
│   │   ├── dashboard.ts    # Dashboard data
│   │   ├── investments.ts  # Investment tracking
│   │   ├── planner.ts      # Savings planner
│   │   ├── plaid.ts        # Bank sync (Plaid)
│   │   ├── hello.ts        # Health check
│   │   ├── trpc.ts         # TRPC initialization
│   │   └── index.ts        # Router composition
│   │
│   ├── cognito/           # Cognito triggers
│   │   ├── pre-signup.ts   # Pre-signup handler
│   │   ├── post-confirmation.ts # Post-confirm handler
│   │   └── cookies.ts      # Cookie utilities
│   │
│   ├── data/
│   │   └── demoData.ts    # Demo/mock data
│   │
│   ├── handler.ts         # Lambda entry point
│   ├── process.ts        # Environment config
│   └── server.ts         # TRPC server setup
│
├── jest.config.js         # Jest configuration
├── package.json          # Dependencies
└── tsconfig.json         # TypeScript config
```

## 🚀 Getting Started

### Installation

```bash
cd src/api
npm install
```

### Development

```bash
# Run tests
npm test

# Run tests with coverage
npm test -- --coverage

# Run tests in watch mode
npm test -- --watch
```

### Environment Variables

```env
# Required
TABLE_NAME=agentictrade-users
USER_POOL_ID=us-east-1_xxxxx
CLIENT_ID=xxxxx
REGION=us-east-1

# Optional
DEMO_MODE=true
```

## 🛡️ Security & Rate Limiting

### Rate Limiting

The API implements rate limiting to prevent abuse:

| Endpoint | Limit | Window |
|----------|-------|--------|
| `signUp` | 5 requests | 15 minutes |
| `signIn` | 10 requests | 15 minutes |
| `confirmSignUp` | 10 requests | 15 minutes |
| `resendConfirmationCode` | 3 requests | 1 hour |
| `forgotPassword` | 3 requests | 1 hour |
| `confirmForgotPassword` | 5 requests | 1 hour |

### Security Tests

The API includes security tests covering:
- Input validation
- Authentication bypass prevention
- SQL/NoSQL injection prevention
- Authorization checks
- Rate limiting enforcement

```bash
npm test -- security.test.ts
```

## 📝 API Endpoints

### Authentication (`authRouter`)

| Procedure | Input | Output | Description |
|-----------|-------|--------|-------------|
| `getCurrentUser` | - | User object | Get authenticated user |
| `signUp` | { email, password, name } | Auth result | Create account |
| `signIn` | { email, password } | Auth result | User login |
| `signOut` | - | { success } | User logout |
| `confirmSignUp` | { email, code } | { success } | Verify email |
| `resendConfirmation` | { email } | { success } | Resend code |

### Transactions (`transactionsRouter`)

| Procedure | Input | Output | Description |
|-----------|-------|--------|-------------|
| `getTransactions` | { days, limit, cursor, includeIgnored } | { transactions, nextCursor, hasMore, totalCount } | List transactions with pagination |
| `createTransaction` | Transaction input | Transaction | Add transaction |
| `updateTransaction` | { id, ...updates } | Transaction | Modify transaction |
| `deleteTransaction` | { id } | { success } | Remove transaction |
| `searchTransactions` | { query } | Transaction[] | Search transactions |

**Pagination**: The `getTransactions` endpoint supports cursor-based pagination:
- `limit` - Number of transactions per page (default: 50, max: 100)
- `cursor` - Opaque cursor from previous response
- Returns `nextCursor` and `hasMore` for client-side pagination

**Filtering**:
- `includeIgnored` - Include ignored transactions in results
- `totalCount` - Total count of non-ignored transactions (first page only)

### Categories (`categoriesRouter`)

| Procedure | Input | Output | Description |
|-----------|-------|--------|-------------|
| `getCategories` | - | Category[] | List categories |
| `createCategory` | { name, color, description } | Category | Add category |
| `updateCategory` | { id, ...updates } | Category | Modify category |
| `deleteCategory` | { id } | { success } | Remove category |
| `assignCategory` | { transactionId, category } | { success } | Assign to transaction |
| `autoCategorize` | - | { categorized } | Auto-assign categories |

### Budgets (`budgetsRouter`)

| Procedure | Input | Output | Description |
|-----------|-------|--------|-------------|
| `getBudgets` | - | Budget[] | List budgets |
| `getBudget` | { id } | Budget | Get single budget |
| `createBudget` | Budget input | Budget | Create budget |
| `updateBudget` | { id, ...updates } | Budget | Modify budget |
| `deleteBudget` | { id } | { success } | Remove budget |
| `refreshBudgetSpending` | { id } | { spent, remaining } | Recalculate spending |
| `autoGenerateBudgets` | - | { created } | Generate from categories |

**Spent Calculation**: Budget spent amounts include both expenses AND refunds:
- Negative transactions (expenses) add to spent
- Positive transactions (refunds/credits) subtract from spent
- Example: -$70 + -$90 + $70 refund = $90 spent (not $160)

### Dashboard (`dashboardRouter`)

| Procedure | Input | Output | Description |
|-----------|-------|--------|-------------|
| `getDashboard` | { month, year } | DashboardData | Dashboard overview |
| `getCashflow` | { month, year } | CashflowData | Income vs expenses |
| `getNetWorth` | - | NetWorthData | Net worth history |

### Investments (`investmentsRouter`)

| Procedure | Input | Output | Description |
|-----------|-------|--------|-------------|
| `getInvestments` | - | Investment[] | List investments |
| `createInvestment` | Investment input | Investment | Add investment |
| `updateInvestment` | { id, ...updates } | Investment | Modify investment |
| `deleteInvestment` | { id } | { success } | Remove investment |

### Planner (`plannerRouter`)

| Procedure | Input | Output | Description |
|-----------|-------|--------|-------------|
| `getPlans` | - | Plan[] | List savings plans |
| `createPlan` | Plan input | Plan | Create savings goal |
| `updatePlan` | { id, ...updates } | Plan | Modify plan |
| `deletePlan` | { id } | { success } | Remove plan |
| `addMilestone` | { planId, milestone } | Plan | Add milestone |
| `addExpense` | { planId, expense } | Plan | Add expense |

## 🗄️ Data Types

### Transaction

```typescript
interface Transaction {
  transactionId: string;
  accountId: string;
  amount: number;
  currency: string;
  date: string;
  name: string;
  merchantName?: string;
  categoryId?: string;
  category?: string;        // Legacy field
  subcategory?: string;
  pending: boolean;
  type: 'place' | 'digital' | 'special';
}
```

### Category

```typescript
interface Category {
  id: string;
  name: string;
  color: string;
  description?: string;
  transactionCount: number;
  totalAmount: number;
  avgAmount: number;
  createdAt: string;
  isDefault: boolean;
}
```

### Budget

```typescript
interface Budget {
  id: string;
  userId: string;
  name: string;
  budgetType: 'category' | 'total';
  categoryId?: string;
  amount: number;
  spent: number;
  remaining: number;
  percentage: number;
  period: 'monthly';
  month?: number;
  year?: number;
  startDate: string;
  isAutoGenerated: boolean;
  createdAt: string;
  updatedAt: string;
}
```

## 🧪 Testing

### Running Tests

```bash
# Run all tests
npm test

# Run specific test
npm test -- auth.test.ts

# Run with coverage report
npm test -- --coverage

# Run in watch mode
npm test -- --watch
```

### Test Structure

Tests are organized by router:

```
__tests__/
├── auth.test.ts           # Auth router tests
├── categories.test.ts     # Categories router tests
├── transactions.test.ts   # Transactions router tests
├── budgets.test.ts        # Budgets router tests
├── dashboard.test.ts       # Dashboard router tests
├── investments.test.ts    # Investments router tests
├── planner.test.ts        # Planner router tests
├── routers.test.ts        # Router exports verification
└── categories.integration.test.ts  # Integration tests
```

### Writing Tests

```typescript
describe('Router Name', () => {
  beforeEach(() => {
    // Setup test context
  });

  test('should do something', async () => {
    // Test case
  });
});
```

## 🔐 Authentication Flow

```
1. User signs up → Cognito sends confirmation code
2. User confirms email → Cognito creates user
3. User signs in → Cognito returns tokens
4. TRPC uses tokens to identify user
5. All procedures use protectedProcedure
```

## 🏗️ Deployment

### Build

```bash
npm run build
```

### Deploy to AWS

```bash
cd ../cdk
npm run deploy
```

### Local Development

The API runs as a Lambda function. For local development, use the CDK mock or test against deployed resources.

## 📦 Dependencies

### Core

- `zod` - Schema validation
- `@trpc/server` - TRPC framework
- `@trpc/client` - TRPC client
- `@aws-sdk/client-dynamodb` - DynamoDB client
- `@aws-sdk/lib-dynamodb` - DynamoDB document client
- `aws-lambda` - Lambda types

### Testing

- `jest` - Test framework
- `@types/jest` - Jest types
- `ts-jest` - TypeScript Jest transformer

## 🔧 Configuration

### Environment Variables

```typescript
// src/process.ts
export const config = {
  REGION: process.env.REGION || 'us-east-1',
  TABLE_NAME: process.env.TABLE_NAME,
  USER_POOL_ID: process.env.USER_POOL_ID,
  CLIENT_ID: process.env.CLIENT_ID,
  DEMO_MODE: process.env.DEMO_MODE === 'true',
};
```

### DynamoDB Tables

| Table | Key | Description |
|-------|-----|-------------|
| Users | PK: USER#{userId}, SK: METADATA | User profiles |
| Transactions | PK: USER#{userId}, SK: TRANSACTION#{id} | Transaction data |
| Categories | PK: USER#{userId}, SK: CATEGORY#{id} | User categories |
| Budgets | PK: USER#{userId}, SK: BUDGET#{id} | Budget data |
| Plans | PK: USER#{userId}, SK: PLAN#{id} | Savings plans |
| Investments | PK: USER#{userId}, SK: INVESTMENT#{id} | Investments |

## 📝 Scripts

```bash
npm test              # Run all tests
npm test -- --watch  # Watch mode
npm test -- --coverage # Coverage report
```
